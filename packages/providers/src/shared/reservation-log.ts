import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { eq } from "drizzle-orm";

import type { Database } from "../registry";
import type { ProviderKey } from "../types";

type ReservationEventInsert = typeof providerReservationEvent.$inferInsert;

export type ReservationEventKind = ReservationEventInsert["kind"];

/** Structural subset of the Drizzle executor; see `raw-retention.ts`. */
export interface ReservationEventWriter<TInsertResult = unknown> {
  insert(table: typeof providerReservationEvent): {
    /* Awaited for its effect only, so the driver's result type stays a parameter. */
    values(value: ReservationEventInsert): PromiseLike<TInsertResult>;
  };
}

export interface ReservationEventInput {
  bookingId: string;
  kind: ReservationEventKind;
  provider: string;
  providerReference?: string | null;
  payload?: ReservationEventPayload;
}

/**
 * Keys whose entire subtree is dropped. Credentials because NauSYS ships them in
 * plaintext in every request body; the rest because `docs/backend-architecture.md`
 * forbids crew and passenger PII in application data we query freely.
 *
 * Comparison is on the key with separators stripped, so `date_of_birth`,
 * `dateOfBirth` and `DATEOFBIRTH` all match.
 */
const DROPPED_KEYS = new Set([
  "credentials",
  "username",
  "password",
  "secret",
  "token",
  "authorization",
  "name",
  "surname",
  "firstname",
  "lastname",
  "fullname",
  "email",
  "phone",
  "mobile",
  "telephone",
  "address",
  "address2",
  "street",
  "zip",
  "postcode",
  "postalcode",
  "city",
  "vat",
  "vatnr",
  "vatnumber",
  "birthdate",
  "dateofbirth",
  "birthday",
  "passport",
  "passportnumber",
  "passportexpiry",
  "document",
  "documentnumber",
  "documentid",
  "documenttype",
  "personalid",
  "oib",
  "nationality",
  "citizenship",
  "client",
  "clients",
  "contact",
  "contacts",
  "crew",
  "crewlist",
  "crewmembers",
  "passenger",
  "passengers",
]);

function isDropped(key: string): boolean {
  return DROPPED_KEYS.has(key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase());
}

/**
 * What a provider hands the event log: JSON, plus `Date` and `undefined`, which
 * the projections carry before anything serialises them.
 */
export type ReservationEventPayload =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly ReservationEventPayload[]
  | { readonly [key: string]: ReservationEventPayload };

function sanitize(value: ReservationEventPayload, seen: WeakSet<object>): ReservationEventPayload {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const result: Record<string, ReservationEventPayload> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isDropped(key)) {
      continue;
    }
    result[key] = sanitize(item, seen);
  }
  return result;
}

/**
 * The single sanitizer for anything written to `provider_reservation_event`.
 * Dropping rather than masking: a masked key still tells a reader the field was
 * present, but leaves the shape available for someone to "restore" later.
 */
export function sanitizeReservationPayload(
  payload: ReservationEventPayload,
): ReservationEventPayload {
  return sanitize(payload, new WeakSet());
}

export async function recordReservationEvent<TInsertResult>(
  db: ReservationEventWriter<TInsertResult>,
  input: ReservationEventInput,
): Promise<void> {
  await db.insert(providerReservationEvent).values({
    bookingId: input.bookingId,
    kind: input.kind,
    provider: input.provider,
    providerReference: input.providerReference ?? null,
    payload: input.payload === undefined ? null : sanitizeReservationPayload(input.payload),
  });
}

export interface QuoteReservationEventInput {
  /** Our quote id; `booking.quote_id` is what ties an event back to a booking. */
  quoteId: string;
  kind: ReservationEventKind;
  providerReference?: string | null;
  payload?: ReservationEventPayload;
}

export type ReservationEventRecorder = (event: QuoteReservationEventInput) => Promise<void>;

/**
 * `provider_reservation_event` is keyed by booking, and a `BookingDraft` carries
 * the quote instead. Neither vendor's pricing call produces a provider quote id,
 * so `draft.quoteId` is always ours and the join is exact.
 */
export function createReservationEventRecorder(
  db: Database,
  providerKey: ProviderKey,
): ReservationEventRecorder {
  return async ({ quoteId, kind, providerReference, payload }) => {
    const [row] = await db
      .select({ id: booking.id })
      .from(booking)
      .where(eq(booking.quoteId, quoteId))
      .limit(1);

    // Reconciliation and admin tooling can drive these calls with no booking
    // behind them; that is not a reason to fail the provider call.
    if (!row) return;

    await recordReservationEvent(db, {
      bookingId: row.id,
      kind,
      provider: providerKey,
      providerReference,
      payload,
    });
  };
}
