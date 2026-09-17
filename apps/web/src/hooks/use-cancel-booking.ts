"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelBookingMutationOptions, cancelledBookingStaleKeys } from "@/lib/api/queries";

/**
 * Cancels a booking, then refreshes both surfaces that show its state: My Bookings, whose card
 * flips to a "Cancelled" chip and loses its Cancel button, and the booking page, whose status
 * chip and actions read the same fields.
 *
 * The listing's own availability goes with it. A live checkout holds its dates at read time
 * rather than in `availability_slot`, so cancelling frees them the moment the status moves, and
 * every read that subtracts those holds is answering with a week that is no longer taken: the
 * sidebar calendar paints it held, and the listing document withholds it as an advertised
 * charter. Nothing else invalidates them — cancelling happens on another page, and the listing
 * is cached for an hour — so the boat the visitor just released stays blocked in front of them.
 *
 * By procedure rather than by listing id: `booking.cancel` answers with the booking, not with
 * the hull it was for, and these queries are cheap enough that refetching a few extra is worth
 * less than plumbing the id through to find out which ones to name.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    ...cancelBookingMutationOptions(),
    onSuccess: () =>
      Promise.all(
        cancelledBookingStaleKeys().map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}
