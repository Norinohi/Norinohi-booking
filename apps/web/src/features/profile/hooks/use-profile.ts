"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { profileQueryOptions } from "../api/queries";

/** Reads the current user's profile — server-prefetched on /profile, so it hydrates warm. */
export function useProfile() {
  return useQuery(profileQueryOptions());
}

/** Persists editable profile fields (name, phone) and refreshes the profile query. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.profile.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.profile.get.key() }),
    }),
  );
}

/** Deactivates the account and revokes all sessions; reactivation is the next sign-in. */
export function useDeactivateProfile() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.profile.deactivate.mutationOptions({
      // Every session is revoked server-side — drop the whole cache so no
      // profile data lingers for the next user of this browser.
      onSuccess: () => queryClient.clear(),
    }),
  );
}
