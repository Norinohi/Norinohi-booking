"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import { wishlistIdsQueryOptions } from "../api/queries";
import * as localWishlist from "../lib/local-wishlist";
import type { WishlistMode } from "../types";

/*
 * Collapses the guest store and the account behind one saved set, so bookmark
 * buttons never branch on auth state. Also owns the guest -> account merge, which
 * lives here rather than in the auth forms because a session can appear without
 * either form running (OAuth redirect, cookie restore in a second tab).
 */

type WishlistContextValue = {
  mode: WishlistMode;
  /** False until the session resolves and the saved set is known — gate counts on this. */
  isReady: boolean;
  savedIds: ReadonlySet<string>;
  /** Size of the saved set — drives the header count badge. */
  savedCount: number;
  /** Bumped once per user-initiated add (never on remove, merge, or load) so the header can
   * play its "added" animation exactly when a listing enters the wishlist. */
  addSignal: number;
  isSaved: (listingId: string) => boolean;
  isPending: (listingId: string) => boolean;
  toggle: (listingId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

const EMPTY_IDS: string[] = [];

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export default function WishlistProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Wishlist");
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const mode: WishlistMode = userId ? "user" : "guest";

  const localIds = useSyncExternalStore(
    localWishlist.subscribe,
    localWishlist.getSnapshot,
    localWishlist.getServerSnapshot,
  );

  const idsQuery = useQuery({ ...wishlistIdsQueryOptions(), enabled: mode === "user" });

  const savedIds = useMemo(
    () => new Set(mode === "user" ? (idsQuery.data?.listingIds ?? EMPTY_IDS) : localIds),
    [mode, idsQuery.data, localIds],
  );

  /* Per-listing, so one card's in-flight toggle never disables its neighbours. */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

  /* Monotonic tick the header watches to animate its icon on each add. */
  const [addSignal, setAddSignal] = useState(0);

  const markPending = useCallback((listingId: string, pending: boolean) => {
    setPendingIds((current) => {
      if (current.has(listingId) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
  }, []);

  /*
   * Only the ids cache is patched: it is what the buttons read, while patching the
   * paginated list would mean re-deriving server ordering and the published-listing
   * filter on the client. The list is invalidated instead.
   */
  const patchIds = useCallback(
    async (listingId: string, saved: boolean) => {
      const queryKey = wishlistIdsQueryOptions().queryKey;
      /* Without this an in-flight refetch lands last and visually reverts the toggle. */
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        const current = old?.listingIds ?? EMPTY_IDS;
        return {
          listingIds: saved
            ? [listingId, ...current.filter((id) => id !== listingId)]
            : current.filter((id) => id !== listingId),
        };
      });

      markPending(listingId, true);
      return { previous, queryKey };
    },
    [markPending, queryClient],
  );

  const settleIds = useCallback(
    (listingId: string) => {
      markPending(listingId, false);
      queryClient.invalidateQueries({ queryKey: wishlistIdsQueryOptions().queryKey });
      queryClient.invalidateQueries({ queryKey: orpc.wishlist.list.key() });
    },
    [markPending, queryClient],
  );

  const rollback = useCallback(
    (context: { previous: unknown; queryKey: readonly unknown[] } | undefined) => {
      if (!context?.previous) return;
      queryClient.setQueryData(context.queryKey, context.previous);
      toast.error(t("toggleFailed"));
    },
    [queryClient, t],
  );

  const addMutation = useMutation(
    orpc.wishlist.add.mutationOptions({
      onMutate: ({ listingId }) => patchIds(listingId, true),
      onError: (_error, _input, context) => rollback(context),
      onSettled: (_data, _error, { listingId }) => settleIds(listingId),
    }),
  );

  const removeMutation = useMutation(
    orpc.wishlist.remove.mutationOptions({
      onMutate: ({ listingId }) => patchIds(listingId, false),
      onError: (_error, _input, context) => rollback(context),
      onSettled: (_data, _error, { listingId }) => settleIds(listingId),
    }),
  );

  const mergeMutation = useMutation(orpc.wishlist.merge.mutationOptions({}));
  const mergeAsync = mergeMutation.mutateAsync;

  const mergedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (sessionPending) return;

    if (!userId) {
      /* Re-arm. The account list is deliberately not copied down into localStorage:
       * that would leak these saves to the next user of this browser. */
      mergedForUser.current = null;
      return;
    }

    if (mergedForUser.current === userId) return;
    /* Claimed before the first await so StrictMode's double-effect merges once. */
    mergedForUser.current = userId;

    const pending = localWishlist.read();
    if (pending.length === 0) return;

    void (async () => {
      let merged = 0;
      try {
        /* Chunked even though the store caps at 50, so a hand-edited or legacy value
         * still merges instead of failing input validation. */
        for (const ids of chunk(pending, localWishlist.MAX_ITEMS)) {
          const result = await mergeAsync({ listingIds: ids });
          merged += result.added;
          localWishlist.removeMany(ids);
        }
        if (merged > 0) toast.success(t("merged", { count: merged }));
      } catch {
        /* Release the claim so the next mount retries. */
        mergedForUser.current = null;
      } finally {
        queryClient.invalidateQueries({ queryKey: wishlistIdsQueryOptions().queryKey });
        queryClient.invalidateQueries({ queryKey: orpc.wishlist.list.key() });
      }
    })();
  }, [mergeAsync, queryClient, sessionPending, t, userId]);

  const toggle = useCallback(
    (listingId: string) => {
      /* Read from the cache at click time, never from a mutation response —
       * wishlist.add answers `saved: true` for an already-saved listing. */
      const saved = savedIds.has(listingId);

      /* Add-only pulse: the header animates when something enters the wishlist, not when it leaves. */
      if (!saved) setAddSignal((tick) => tick + 1);

      if (mode === "guest") {
        if (saved) localWishlist.remove(listingId);
        else localWishlist.add(listingId);
        return;
      }

      if (saved) removeMutation.mutate({ listingId });
      else addMutation.mutate({ listingId });
    },
    [addMutation, mode, removeMutation, savedIds],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      mode,
      isReady: !sessionPending && (mode === "guest" || !idsQuery.isPending),
      savedIds,
      savedCount: savedIds.size,
      addSignal,
      isSaved: (listingId) => savedIds.has(listingId),
      isPending: (listingId) => pendingIds.has(listingId),
      toggle,
    }),
    [addSignal, idsQuery.isPending, mode, pendingIds, savedIds, sessionPending, toggle],
  );

  return <WishlistContext value={value}>{children}</WishlistContext>;
}

export function useWishlistContext(): WishlistContextValue {
  const context = use(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used inside <WishlistProvider>");
  }
  return context;
}
