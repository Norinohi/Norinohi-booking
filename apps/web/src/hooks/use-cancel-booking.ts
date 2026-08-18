"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * Cancels a booking, then refreshes both surfaces that show its state: My Bookings, whose card
 * flips to a "Cancelled" chip and loses its Cancel button, and the booking page, whose status
 * chip and actions read the same fields.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.booking.list.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.booking.get.key() }),
        ]),
    }),
  );
}
