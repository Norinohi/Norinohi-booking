/**
 * Whether a charter nobody sold went unsold because every vendor failed to answer, rather than
 * because one of them said the dates are taken.
 *
 * Only an `unavailable` outcome is a vendor's word about the dates. An error or a timeout is
 * silence, and answering it as a refusal told the listing page the week was gone while NauSYS
 * was returning 502 for every boat.
 */
export function onlyVendorFailures(attempts: readonly { outcome: string }[]): boolean {
  if (attempts.some((attempt) => attempt.outcome === "unavailable")) return false;
  return attempts.some((attempt) => attempt.outcome === "error" || attempt.outcome === "timeout");
}
