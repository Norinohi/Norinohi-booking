"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import { usePriceBasis } from "@/components/shared/form/filters";

import {
  listingsByIdsQueryOptions,
  WISHLIST_PAGE_SIZE,
  wishlistListQueryOptions,
} from "../api/queries";
import * as localWishlist from "../lib/local-wishlist";
import { savedCardInput } from "../lib/saved-card-input";
import type { SavedCard, WishlistMode } from "../types";
import { useWishlist } from "./use-wishlist";

const EMPTY_CARDS: SavedCard[] = [];

export type WishlistPageState = {
  mode: WishlistMode;
  isLoading: boolean;
  cards: SavedCard[];
  totalItems: number;
  pageSize: number;
  /**
   * wishlist.list paginates over saved rows but hydrates them through a published-only
   * read model, so an unpublished (or, for guests, delisted) save is counted and then
   * dropped — a page can come back short or even empty while totalItems is nonzero.
   */
  hasStaleSaves: boolean;
};

/**
 * `searchedPeriod` is undefined until the last search has been read, and nothing is fetched before
 * then: pricing the nearest charters first would flash prices the searched week replaces.
 */
export function useWishlistPage(
  page: number,
  searchedPeriod: CharterPeriod | null | undefined,
): WishlistPageState {
  const { mode, isReady } = useWishlist();

  const locale = useLocale();
  const { explicit } = usePriceBasis();
  const periodRead = searchedPeriod !== undefined;
  const card = savedCardInput(locale, explicit, searchedPeriod ?? null);

  const listQuery = useQuery({
    ...wishlistListQueryOptions(page, card),
    enabled: mode === "user" && periodRead,
  });

  const localIds = useSyncExternalStore(
    localWishlist.subscribe,
    localWishlist.getSnapshot,
    localWishlist.getServerSnapshot,
  );
  const start = (page - 1) * WISHLIST_PAGE_SIZE;
  const pageIds = mode === "guest" ? localIds.slice(start, start + WISHLIST_PAGE_SIZE) : [];

  const guestQuery = useQuery({
    ...listingsByIdsQueryOptions(pageIds, card),
    enabled: mode === "guest" && pageIds.length > 0 && periodRead,
  });

  const isUser = mode === "user";
  const totalItems = isUser ? (listQuery.data?.pagination.totalItems ?? 0) : localIds.length;
  const cards = isUser ? (listQuery.data?.items ?? EMPTY_CARDS) : (guestQuery.data ?? EMPTY_CARDS);

  const isLoading =
    !isReady ||
    !periodRead ||
    (isUser ? listQuery.isPending : pageIds.length > 0 && guestQuery.isPending);

  const expected = Math.max(Math.min(WISHLIST_PAGE_SIZE, totalItems - start), 0);

  return {
    mode,
    isLoading,
    cards,
    totalItems,
    pageSize: WISHLIST_PAGE_SIZE,
    hasStaleSaves: !isLoading && cards.length < expected,
  };
}
