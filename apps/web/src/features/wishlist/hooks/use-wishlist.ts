"use client";

import { useWishlistContext } from "../components/wishlist-provider";

export function useWishlist() {
  return useWishlistContext();
}

/*
 * The single API every bookmark button uses, so a card behaves the same signed in
 * or out. listingId is optional because some cards render sample data with no real
 * listing id; those get an inert button instead of a mutation that would 404.
 */
export function useWishlistToggle(listingId?: string) {
  const { isSaved, isPending, toggle, isReady, mode } = useWishlist();

  return {
    saved: listingId ? isSaved(listingId) : false,
    pending: listingId ? isPending(listingId) : false,
    disabled: !listingId,
    isReady,
    mode,
    toggle: () => {
      if (listingId) toggle(listingId);
    },
  };
}
