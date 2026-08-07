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
 * The referral code is deterministic per user (NORI-<userId>), so a prefetched
 * value never goes stale within a session — Infinity avoids a pointless refetch
 * on every /profile/referrals mount.
 */
export const referralCodeQueryOptions = () =>
  orpc.referral.myCode.queryOptions({ staleTime: Infinity });
