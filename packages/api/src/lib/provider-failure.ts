import { ProviderError, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";

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
  "We could not complete this booking with the operator. Our team has been notified — please try again shortly or contact us.";

/**
 * Classified off the taxonomy rather than the vendor's own code, so a provider we
 * add later needs no entry here: whatever `packages/providers` maps a status to
 * already decides which of the three a customer sees.
 */
function customerMessage(error: Error | null): string {
  if (error instanceof SlotUnavailableError) return UNAVAILABLE;
  if (!(error instanceof ProviderError)) return CONTACT_US;

  switch (error.errorType) {
    case "not_found":
      return UNAVAILABLE;
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
