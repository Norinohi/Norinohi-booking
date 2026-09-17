"use client";

import { useQuery } from "@tanstack/react-query";

import { checkoutStatusQueryOptions } from "../api/queries";
import { guestAccessFor } from "../lib/guest-access";
import { pendingHoldDeadline } from "../lib/hold-clock";

/**
 * The held booking's provider deadline, from the booking record.
 *
 * `createHold` answers with the same figure, but only to the tab that pressed Confirm. The record
 * is what this step and the pay and booking pages share, so all three show one deadline.
 */
export function useHoldDeadline(bookingId: string | null): string | null {
  const { data } = useQuery({
    ...checkoutStatusQueryOptions(bookingId ?? "", guestAccessFor(bookingId)),
    enabled: bookingId !== null,
  });
  return data ? pendingHoldDeadline(data) : null;
}
