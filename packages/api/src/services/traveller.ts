import { ORPCError } from "@orpc/server";
import { bookingTraveller } from "@yacht-charter/db/schema/booking";
import { asc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
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

type TravellerRow = typeof bookingTraveller.$inferSelect;

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
  await readOwnedBooking(db, userId, bookingId);

  const rows = await db
    .select()
    .from(bookingTraveller)
    .where(eq(bookingTraveller.bookingId, bookingId))
    .orderBy(asc(bookingTraveller.createdAt), asc(bookingTraveller.id));

  return { bookingId, travellers: rows.map(present) };
}

/**
 * Replaces the whole list in one transaction.
 *
 * Delete-then-insert rather than a diff: the client posts the form as it stands,
 * and matching rows up would mean trusting ids the browser round-tripped. The
 * transaction is what keeps a failed insert from leaving the booking with no crew
 * list at all.
 */
export async function saveTravellers(
  db: Database,
  userId: string,
  input: SaveInput,
): Promise<ListResult> {
  const { booking: row } = await readOwnedBooking(db, userId, input.bookingId);

  if (CLOSED.includes(row.status as BookingStatus)) {
    throw new ORPCError("CONFLICT", {
      message: `Cannot edit the crew list of a booking in ${row.status}`,
    });
  }

  // Encrypted outside the transaction: a missing key must fail before anything is
  // deleted, not halfway through the replacement.
  const values = input.travellers.map((traveller) => ({
    bookingId: input.bookingId,
    fullName: traveller.fullName,
    role: traveller.role ?? null,
    dateOfBirth: encryptOptionalPii(traveller.dateOfBirth),
    documentNumber: encryptOptionalPii(traveller.documentNumber),
    nationality: traveller.nationality ?? null,
  }));

  const saved = await db.transaction(async (tx) => {
    await tx.delete(bookingTraveller).where(eq(bookingTraveller.bookingId, input.bookingId));
    if (values.length === 0) return [];
    return tx.insert(bookingTraveller).values(values).returning();
  });

  return { bookingId: input.bookingId, travellers: saved.map(present) };
}

/**
 * The document fields are decrypted only here, on the way to the person who typed
 * them. Nothing else in the API reads this table.
 */
function present(row: TravellerRow): Traveller {
  return {
    id: row.id,
    fullName: row.fullName,
    role: row.role,
    dateOfBirth: decryptOptionalPii(row.dateOfBirth),
    documentNumber: decryptOptionalPii(row.documentNumber),
    nationality: row.nationality,
  };
}
