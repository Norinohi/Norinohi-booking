import { ORPCError } from "@orpc/server";
import { booking, bookingTraveller } from "@yacht-charter/db/schema/booking";
import { asc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { CrewListMember, CrewListReceipt, InventoryProvider } from "@yacht-charter/providers";

import type { Database } from "../context";
import type {
  crewPlaceSearchInputSchema,
  crewPlacesSchema,
  crewListSubmissionSchema,
  crewRequirementsSchema,
  travellerListSchema,
  travellerSaveInputSchema,
  travellerSchema,
} from "../contracts/booking";
import { decryptOptionalPii, encryptOptionalPii } from "../lib/pii";
import { readOwnedBooking } from "./booking-read";
import type { BookingStatus } from "./booking-state";

type Traveller = z.infer<typeof travellerSchema>;
type ListResult = z.infer<typeof travellerListSchema>;
type SaveInput = z.infer<typeof travellerSaveInputSchema>;
type CrewRequirementsResult = z.infer<typeof crewRequirementsSchema>;
type Submission = z.infer<typeof crewListSubmissionSchema>;
type PlaceSearch = z.infer<typeof crewPlaceSearchInputSchema>;
type PlacesResult = z.infer<typeof crewPlacesSchema>;

/** Enough to choose from, few enough to render: the vendor's list is 6,851 names long. */
const PLACE_LIMIT = 20;

type TravellerRow = typeof bookingTraveller.$inferSelect;
type BookingRow = typeof booking.$inferSelect;

/**
 * A crew list is only worth collecting for a booking that is still going to
 * happen. Everything else is either finished with or was never confirmed, and
 * accepting passport data for it would be collecting PII we have no use for.
 */
const CLOSED: readonly BookingStatus[] = [
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "PROVIDER_REJECTED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
];

export async function listTravellers(
  db: Database,
  userId: string,
  bookingId: string,
): Promise<ListResult> {
  // Ownership first: an unowned booking reads as missing, so the id cannot be
  // probed for whether it holds crew data.
  const { booking: owned } = await readOwnedBooking(db, userId, bookingId);

  const rows = await db
    .select()
    .from(bookingTraveller)
    .where(eq(bookingTraveller.bookingId, bookingId))
    .orderBy(asc(bookingTraveller.createdAt), asc(bookingTraveller.id));

  return { bookingId, travellers: rows.map(present), submission: submissionOf(owned) };
}

/**
 * What the operator requires on this booking's crew list, or nothing.
 *
 * Read from the provider on demand rather than stored: the requirement belongs to the vendor's
 * reservation and can change with it, and nothing we hold depends on the answer. A provider
 * that cannot say, a booking that never reached the vendor, and a vendor that is slow all give
 * the same empty answer, because the form has to render either way.
 */
export async function readCrewRequirements(
  db: Database,
  provider: InventoryProvider,
  userId: string,
  bookingId: string,
): Promise<CrewRequirementsResult> {
  const { booking: owned } = await readOwnedBooking(db, userId, bookingId);
  const empty = { bookingId, fields: [], maxPassengers: null, skipperRequired: null };

  if (!owned.providerReservationId || !provider.getCrewRequirements) return empty;

  const ref = {
    providerReservationId: owned.providerReservationId,
    ...(owned.providerReservationUuid ? { securityToken: owned.providerReservationUuid } : null),
  };
  const requirements = await provider.getCrewRequirements(ref);
  if (!requirements) return empty;

  return {
    bookingId,
    fields: requirements.requiredFields,
    maxPassengers: requirements.maxPassengers,
    skipperRequired: requirements.skipperRequired,
  };
}

/**
 * The places this booking's operator will accept, for a customer typing one.
 *
 * Ownership is checked first, like every other call on this table -- not because the place
 * list is private (it is a public vendor endpoint) but because the booking id in the request
 * must not answer differently for a booking that is not yours. A provider that publishes no
 * such list, or one that cannot be reached, answers with nothing and the field stays free text.
 */
export async function searchCrewPlaces(
  db: Database,
  provider: InventoryProvider,
  userId: string,
  input: PlaceSearch,
): Promise<PlacesResult> {
  await readOwnedBooking(db, userId, input.bookingId);
  if (!provider.searchCrewPlaces) return { places: [] };

  try {
    return { places: await provider.searchCrewPlaces(input.query, PLACE_LIMIT) };
  } catch {
    return { places: [] };
  }
}

/**
 * Replaces the whole list in one transaction, then files it with the operator.
 *
 * Delete-then-insert rather than a diff: the client posts the form as it stands,
 * and matching rows up would mean trusting ids the browser round-tripped. The
 * transaction is what keeps a failed insert from leaving the booking with no crew
 * list at all.
 *
 * The submission happens after the commit and cannot undo it. A customer who typed their
 * passport details has done their part whatever the vendor answers, and losing what they
 * typed because the operator was unreachable would make them type it again for nothing --
 * so the outcome is recorded on the booking and handed back for the panel to show.
 */
export async function saveTravellers(
  db: Database,
  provider: InventoryProvider,
  userId: string,
  input: SaveInput,
): Promise<ListResult> {
  const { booking: row, quote: quoted } = await readOwnedBooking(db, userId, input.bookingId);

  if (CLOSED.includes(row.status)) {
    throw new ORPCError("CONFLICT", {
      message: `Cannot edit the crew list of a booking in ${row.status}`,
    });
  }

  // Encrypted outside the transaction: a missing key must fail before anything is
  // deleted, not halfway through the replacement.
  const values = input.travellers.map((traveller) => ({
    bookingId: input.bookingId,
    firstName: traveller.firstName,
    lastName: traveller.lastName,
    role: traveller.role ?? null,
    isSkipper: traveller.isSkipper ?? false,
    dateOfBirth: encryptOptionalPii(traveller.dateOfBirth),
    documentType: traveller.documentType ?? null,
    documentNumber: encryptOptionalPii(traveller.documentNumber),
    nationality: traveller.nationality ?? null,
    gender: traveller.gender ?? null,
    birthPlace: encryptOptionalPii(traveller.birthPlace),
    birthCountry: traveller.birthCountry ?? null,
    livingPlace: encryptOptionalPii(traveller.livingPlace),
    livingCountry: traveller.livingCountry ?? null,
    skipperLicence: encryptOptionalPii(traveller.skipperLicence),
    vhfLicence: encryptOptionalPii(traveller.vhfLicence),
    skipperEmail: encryptOptionalPii(traveller.skipperEmail),
    skipperMobile: encryptOptionalPii(traveller.skipperMobile),
  }));

  const saved = await db.transaction(async (tx) => {
    await tx.delete(bookingTraveller).where(eq(bookingTraveller.bookingId, input.bookingId));
    if (values.length === 0) return [];
    return tx.insert(bookingTraveller).values(values).returning();
  });

  const submission = await submitCrewList(db, provider, row, quoted, input);

  return { bookingId: input.bookingId, travellers: saved.map(present), submission };
}

/**
 * Hands the list to the charter company and records what it said.
 *
 * Silent in three cases, all of them "there is nobody to send this to yet": a provider that
 * takes no crew list, a booking that never reached the vendor, and an empty list, which would
 * otherwise wipe a manifest the customer already filed. Everything else is submitted and its
 * answer stored, including a failure -- an unreached operator is exactly what the customer
 * needs to know about, since the base will then be asking for all of it at the desk.
 */
async function submitCrewList(
  db: Database,
  provider: InventoryProvider,
  row: BookingRow,
  charter: { checkIn: string; checkOut: string },
  input: SaveInput,
): Promise<Submission | null> {
  if (!provider.submitCrewList || !row.providerReservationId || input.travellers.length === 0) {
    return null;
  }

  const ref = {
    providerReservationId: row.providerReservationId,
    ...(row.providerReservationUuid ? { securityToken: row.providerReservationUuid } : null),
  };

  const submittedAt = new Date();
  let outcome: Pick<Submission, "accepted" | "message">;
  try {
    const receipt = await provider.submitCrewList({
      ref,
      members: input.travellers.map((traveller) => memberOf(traveller, charter)),
      ...(input.note === undefined ? null : { note: input.note }),
    });
    outcome = { accepted: receipt.accepted, message: refusalMessage(receipt) };
  } catch (error) {
    /* Never the passenger data, and never the vendor's stack: just what went wrong. */
    outcome = {
      accepted: null,
      message: error instanceof Error ? error.message : "The operator could not be reached",
    };
  }

  await db
    .update(booking)
    .set({
      crewListSubmittedAt: submittedAt,
      crewListAccepted: outcome.accepted,
      crewListMessage: outcome.message,
    })
    .where(eq(booking.id, input.bookingId));

  return { submittedAt, ...outcome };
}

/** A refusal is only worth repeating when it says something the customer can act on. */
function refusalMessage(receipt: CrewListReceipt): string | null {
  if (receipt.accepted) return null;
  if (receipt.invalidPeriod) {
    return `The operator needs the list to cover ${receipt.invalidPeriod.from} to ${receipt.invalidPeriod.to}`;
  }
  return receipt.message ?? receipt.providerCode ?? "The operator did not accept the crew list";
}

/** The provider vocabulary is the same as ours here, minus the fields no vendor asked for. */
function memberOf(
  traveller: SaveInput["travellers"][number],
  charter: { checkIn: string; checkOut: string },
): CrewListMember {
  return {
    embarkDate: charter.checkIn,
    disembarkDate: charter.checkOut,
    firstName: traveller.firstName,
    lastName: traveller.lastName,
    skipper: traveller.isSkipper ?? false,
    ...(traveller.dateOfBirth === undefined ? null : { dateOfBirth: traveller.dateOfBirth }),
    ...(traveller.birthPlace === undefined ? null : { birthPlace: traveller.birthPlace }),
    ...(traveller.birthCountry === undefined ? null : { birthCountry: traveller.birthCountry }),
    ...(traveller.nationality === undefined ? null : { nationality: traveller.nationality }),
    ...(traveller.documentType === undefined ? null : { documentType: traveller.documentType }),
    ...(traveller.documentNumber === undefined
      ? null
      : { documentNumber: traveller.documentNumber }),
    ...(traveller.gender === undefined ? null : { gender: traveller.gender }),
    ...(traveller.livingPlace === undefined ? null : { livingPlace: traveller.livingPlace }),
    ...(traveller.livingCountry === undefined ? null : { livingCountry: traveller.livingCountry }),
    ...(traveller.skipperLicence === undefined
      ? null
      : { skipperLicence: traveller.skipperLicence }),
    ...(traveller.vhfLicence === undefined ? null : { vhfLicence: traveller.vhfLicence }),
    ...(traveller.skipperEmail === undefined ? null : { skipperEmail: traveller.skipperEmail }),
    ...(traveller.skipperMobile === undefined ? null : { skipperMobile: traveller.skipperMobile }),
  };
}

function submissionOf(row: BookingRow): Submission | null {
  if (!row.crewListSubmittedAt) return null;

  return {
    submittedAt: row.crewListSubmittedAt,
    accepted: row.crewListAccepted,
    message: row.crewListMessage,
  };
}

/**
 * The document fields are decrypted only here, on the way to the person who typed
 * them. Nothing else in the API reads this table.
 */
function present(row: TravellerRow): Traveller {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    isSkipper: row.isSkipper,
    dateOfBirth: decryptOptionalPii(row.dateOfBirth),
    documentType: row.documentType,
    documentNumber: decryptOptionalPii(row.documentNumber),
    nationality: row.nationality,
    gender: row.gender,
    birthPlace: decryptOptionalPii(row.birthPlace),
    birthCountry: row.birthCountry,
    livingPlace: decryptOptionalPii(row.livingPlace),
    livingCountry: row.livingCountry,
    skipperLicence: decryptOptionalPii(row.skipperLicence),
    vhfLicence: decryptOptionalPii(row.vhfLicence),
    skipperEmail: decryptOptionalPii(row.skipperEmail),
    skipperMobile: decryptOptionalPii(row.skipperMobile),
  };
}
