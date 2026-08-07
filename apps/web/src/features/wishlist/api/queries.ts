import { orpc } from "@/utils/orpc";

export const WISHLIST_PAGE_SIZE = 10;

export const wishlistIdsQueryOptions = () =>
  orpc.wishlist.ids.queryOptions({ input: {}, staleTime: 30_000 });

/* page/pageSize are explicit even though the contract defaults them — an omitted
 * input would collapse every page onto one cache key. */
export const wishlistListQueryOptions = (page: number, pageSize: number = WISHLIST_PAGE_SIZE) =>
  orpc.wishlist.list.queryOptions({ input: { page, pageSize }, staleTime: 30_000 });

/* wishlist.list is protected, so guests turn their localStorage ids into cards
 * through this public procedure instead. */
export const listingsByIdsQueryOptions = (listingIds: readonly string[]) =>
  orpc.listings.byIds.queryOptions({
    input: { listingIds: [...listingIds] },
    enabled: listingIds.length > 0,
    staleTime: 60_000,
  });
