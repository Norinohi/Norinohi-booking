import { orpc } from "@/utils/orpc";

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
