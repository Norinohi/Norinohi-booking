import { ProviderError, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";
import { log } from "evlog";

/**
 * What a provider refusal is allowed to say out loud.
 *
 * A provider error message is written for us, not for the customer: NauSYS
 * answers a refused hold with `NauSYS /CBMS-external/rest/booking/v6/createOption
 * failed with OPERATION_NOT_ALLOWED`, and that string was reaching the checkout
 * toast verbatim. `detail` keeps it for the event log and support; `customer` is
 * what the booking flow shows.
 */
export interface ProviderFailure {
  customer: string;
  detail: string;
}

const UNAVAILABLE =
  "That yacht is no longer available for these dates. Please pick new dates and try again.";
const TRY_AGAIN = "The operator's system did not answer in time. Please try again in a moment.";
const CONTACT_US =
  "We could not complete this booking with the operator. Our team has been notified, so please try again shortly or contact us.";

/**
 * Whether the vendor said the charter itself is gone, rather than failing to answer.
 *
 * The difference decides what is written down about the boat, so it is a taxonomy question
 * and not a wording one: only a refusal that means "sold" may take a week off the calendar,
 * while a vendor having a bad night must never look like a boat that no longer exists. Kept
 * beside `customerMessage`, and read by it, so the sentence a customer sees and the fact we
 * record cannot come to disagree.
 */
export function saysSlotIsGone(error: Error | null): boolean {
  if (error instanceof SlotUnavailableError) return true;
  return error instanceof ProviderError && error.errorType === "not_found";
}

/**
 * Classified off the taxonomy rather than the vendor's own code, so a provider we
 * add later needs no entry here: whatever `packages/providers` maps a status to
 * already decides which of the three a customer sees.
 */
function customerMessage(error: Error | null): string {
  if (saysSlotIsGone(error)) return UNAVAILABLE;
  if (!(error instanceof ProviderError)) return CONTACT_US;

  switch (error.errorType) {
    case "rate_limited":
    case "transient":
      return TRY_AGAIN;
    default:
      return CONTACT_US;
  }
}

/**
 * `error` is narrowed by the caller rather than taken as `unknown`: a `catch`
 * binding is the only source, and `instanceof Error` is the one parse it needs.
 */
export function describeProviderFailure(
  error: Error | null,
  fallbackDetail: string,
): ProviderFailure {
  return {
    customer: customerMessage(error),
    detail: error?.message ?? fallbackDetail,
  };
}

/** Which booking call was refused. Named, because the fix differs by step. */
export type ProviderOperation = "hold" | "confirm" | "release";

/**
 * Tells us a vendor refused a booking call, at a level that reflects whether anyone has to act.
 *
 * A refused hold used to leave nothing but a `provider_reservation_event` row, which is a table
 * nobody watches: the OPERATION_NOT_ALLOWED that ended a QA checkout was found by reading it by
 * hand, weeks later. An auth-class refusal is the one that always means something is wrong on
 * our side rather than the customer's -- our credential cannot touch that boat, or the vendor is
 * still holding a week our own rows call free -- so it goes out at error level and reaches the
 * Sentry drain. Everything else is the ordinary noise of selling other people's boats.
 */
export function reportProviderRefusal(
  operation: ProviderOperation,
  error: Error | null,
  subject: { bookingId: string; provider: string },
): void {
  const event = {
    action: "provider_refusal",
    operation,
    bookingId: subject.bookingId,
    provider: subject.provider,
    ...(error instanceof ProviderError ? error.sanitizedContext() : { message: error?.message }),
  };

  if (error instanceof ProviderError && error.errorType === "auth") {
    log.error(event);
    return;
  }
  log.warn(event);
}
