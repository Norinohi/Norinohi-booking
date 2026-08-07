"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  listingsByIdsQueryOptions,
  WISHLIST_PAGE_SIZE,
  wishlistListQueryOptions,
} from "../api/queries";
import * as localWishlist from "../lib/local-wishlist";
import type { ListingSummary, WishlistMode } from "../types";
import { useWishlist } from "./use-wishlist";

const EMPTY_LISTINGS: ListingSummary[] = [];

export type WishlistPageState = {
  mode: WishlistMode;
  isLoading: boolean;
  listings: ListingSummary[];
  totalItems: number;
  pageSize: number;
  /**
   * wishlist.list paginates over saved rows but hydrates them through a published-only
   * read model, so an unpublished (or, for guests, delisted) save is counted and then
   * dropped — a page can come back short or even empty while totalItems is nonzero.
   */
  hasStaleSaves: boolean;
};

export function useWishlistPage(page: number): WishlistPageState {
  const { mode, isReady } = useWishlist();

  const listQuery = useQuery({ ...wishlistListQueryOptions(page), enabled: mode === "user" });

  const localIds = useSyncExternalStore(
    localWishlist.subscribe,
    localWishlist.getSnapshot,
    localWishlist.getServerSnapshot,
  );
  const start = (page - 1) * WISHLIST_PAGE_SIZE;
  const pageIds = mode === "guest" ? localIds.slice(start, start + WISHLIST_PAGE_SIZE) : [];

  const guestQuery = useQuery({
    ...listingsByIdsQueryOptions(pageIds),
    enabled: mode === "guest" && pageIds.length > 0,
  });

  const isUser = mode === "user";
  const totalItems = isUser ? (listQuery.data?.pagination.totalItems ?? 0) : localIds.length;
  const listings = isUser
    ? (listQuery.data?.items.map((item) => item.listing) ?? EMPTY_LISTINGS)
    : (guestQuery.data ?? EMPTY_LISTINGS);

  const isLoading =
    !isReady || (isUser ? listQuery.isPending : pageIds.length > 0 && guestQuery.isPending);

  const expected = Math.max(Math.min(WISHLIST_PAGE_SIZE, totalItems - start), 0);

  return {
    mode,
    isLoading,
    listings,
    totalItems,
    pageSize: WISHLIST_PAGE_SIZE,
    hasStaleSaves: !isLoading && listings.length < expected,
  };
}
