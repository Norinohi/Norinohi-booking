import { orpc } from "@/utils/orpc";

import type { BookingStatus } from "../types";

/*
 * Isomorphic query option factories — used by both the server prefetch helper
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 */
/*
 * staleTime keeps the server-prefetched snapshot fresh across hydration —
 * with the default 0 every /profile visit would refetch immediately on mount,
 * duplicating the SSR request. Mutations invalidate the key explicitly.
 */
export const profileQueryOptions = () => orpc.profile.get.queryOptions({ staleTime: 30_000 });

/*
 * One call backs the whole upper half of /profile/referrals — the share code,
 * the four stat tiles and the Your Level card — so the invite hero and the
 * level card read the same cache entry instead of firing two requests.
 * Rotating the code and earning credit both invalidate it, so it may go stale.
 */
export const referralSummaryQueryOptions = () =>
  orpc.referral.summary.queryOptions({ staleTime: 30_000 });

/** Referral history page size — the design shows a single unpaged table. */
export const REFERRAL_HISTORY_PAGE_SIZE = 10;

export const referralHistoryQueryOptions = (page = 1) =>
  orpc.referral.history.queryOptions({
    input: { page, pageSize: REFERRAL_HISTORY_PAGE_SIZE },
    staleTime: 30_000,
  });

/*
 * Credits. The balance is summed from the ledger on the server rather than stored, so these two
 * can never disagree — the table is the whole explanation of the figure above it.
 */
export const creditBalanceQueryOptions = () =>
  orpc.credit.balance.queryOptions({ staleTime: 30_000 });

export const CREDIT_LEDGER_PAGE_SIZE = 10;

export const creditLedgerQueryOptions = (page = 1) =>
  orpc.credit.ledger.queryOptions({
    input: { page, pageSize: CREDIT_LEDGER_PAGE_SIZE },
    staleTime: 30_000,
  });

/* ------------------------- admin Discount & Price Manager ------------------------- */

export const DISCOUNTS_PAGE_SIZE = 10;
export const PRICES_PAGE_SIZE = 10;

/* page/pageSize stay explicit so each page keeps its own cache key (wishlist convention). */
export const discountListQueryOptions = (input: {
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.discount.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? DISCOUNTS_PAGE_SIZE },
    staleTime: 30_000,
  });

export const discountQueryOptions = (id: string) =>
  orpc.admin.discount.get.queryOptions({ input: { id }, staleTime: 30_000 });

/** Typeahead behind the "Specific Yachts" picker; empty query lists the first page of yachts. */
export const discountYachtOptionsQueryOptions = (query: string) =>
  orpc.admin.discount.yachtOptions.queryOptions({
    input: { query: query || undefined, limit: 50 },
    staleTime: 30_000,
  });

export const listingPriceListQueryOptions = (input: {
  query?: string;
  category?: string;
  location?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.listingPrice.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? PRICES_PAGE_SIZE },
    staleTime: 30_000,
  });

/** The catalogue's category/location dropdown options — changes only on catalogue sync. */
export const listingPriceFiltersQueryOptions = () =>
  orpc.admin.listingPrice.filters.queryOptions({ input: {}, staleTime: 300_000 });

/* ----------------------------------- My Bookings ----------------------------------- */

export const BOOKINGS_PAGE_SIZE = 3;

/* page/pageSize explicit so each page keeps its own cache key; from/to carry the date-range filter. */
export const bookingListQueryOptions = (input: {
  from?: string;
  to?: string;
  status?: BookingStatus[];
  page: number;
  pageSize?: number;
}) =>
  orpc.booking.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? BOOKINGS_PAGE_SIZE },
    staleTime: 30_000,
  });
