import { ORPCError } from "@orpc/client";

/**
 * The vendor refusing a period comes back as CONFLICT. Availability is inferred from
 * occupancy, so this is an expected answer rather than a failure, and the caller narrows
 * the calendar instead of surfacing an error page.
 */
export function isSlotConflict(error: Error): boolean {
  return error instanceof ORPCError && error.code === "CONFLICT";
}
