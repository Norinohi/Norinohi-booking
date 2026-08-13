"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** Cancels a booking, then refreshes My Bookings so its status and cancellability update. */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.booking.list.key() }),
    }),
  );
}
