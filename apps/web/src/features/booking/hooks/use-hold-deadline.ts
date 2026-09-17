"use client";

import { useQuery } from "@tanstack/react-query";

import { checkoutStatusQueryOptions } from "../api/queries";
import { canPay } from "../lib/checkout-status";
import { guestAccessFor } from "../lib/guest-access";
import { pendingHoldDeadline } from "../lib/hold-clock";

/**
 * The held booking's provider deadline, from the booking record, and whether it can still be paid.
 *
 * `createHold` answers with the same figure, but only to the tab that pressed Confirm. The record
 * is what this step and the pay and booking pages share, so all three show one deadline, and a
 * checkout reopened from its URL after the booking lapsed or was cancelled learns it here.
 */
export function useHoldDeadline(bookingId: string | null) {
  const { data } = useQuery({
    ...checkoutStatusQueryOptions(bookingId ?? "", guestAccessFor(bookingId)),
    enabled: bookingId !== null,
  });
  return {
    holdExpiresAt: data ? pendingHoldDeadline(data) : null,
    closed: data ? !canPay(data.status) : false,
  };
}
