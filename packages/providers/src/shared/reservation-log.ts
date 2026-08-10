import { providerReservationEvent } from "@yacht-charter/db/schema/booking";

type ReservationEventInsert = typeof providerReservationEvent.$inferInsert;

export type ReservationEventKind = ReservationEventInsert["kind"];

/** Structural subset of the Drizzle executor; see `raw-retention.ts`. */
export interface ReservationEventWriter {
  insert(table: typeof providerReservationEvent): {
    values(value: ReservationEventInsert): PromiseLike<unknown>;
  };
}

export interface ReservationEventInput {
  bookingId: string;
  kind: ReservationEventKind;
  provider: string;
  providerReference?: string | null;
  payload?: unknown;
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

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
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

  const result: Record<string, unknown> = {};
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
export function sanitizeReservationPayload(payload: unknown): unknown {
  return sanitize(payload, new WeakSet());
}

export async function recordReservationEvent(
  db: ReservationEventWriter,
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
