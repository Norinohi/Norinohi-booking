import { orpc } from "@/utils/orpc";

/*
 * Query and mutation option factories that no single feature owns: the ones read by
 * `components/shared` and app-wide `hooks/`, which may not import a feature, and the ones two or
 * more features read the same cache entry through.
 */

/*
 * The signed-in customer's saved profile. Read by Profile, by checkout for the phone the session
 * does not carry, and by the shared lead form for the phone and country.
 *
 * staleTime keeps the server-prefetched snapshot fresh across hydration -
 * with the default 0 every /profile visit would refetch immediately on mount,
 * duplicating the SSR request. Mutations invalidate the key explicitly.
 */
export const profileQueryOptions = () => orpc.profile.get.queryOptions({ staleTime: 30_000 });

export const createLeadMutationOptions = () => orpc.lead.create.mutationOptions();

export const cancelBookingMutationOptions = () => orpc.booking.cancel.mutationOptions();

/** Every read a cancelled booking leaves stale; see `useCancelBooking` for why each is here. */
export const cancelledBookingStaleKeys = () => [
  orpc.booking.list.key(),
  orpc.booking.get.key(),
  orpc.availability.constraints.key(),
  orpc.availability.calendar.key(),
  orpc.listings.get.key(),
];
