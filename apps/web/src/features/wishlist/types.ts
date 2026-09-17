import type { AppRouterClient } from "@yacht-charter/api/routers/index";

export type WishlistPage = Awaited<ReturnType<AppRouterClient["wishlist"]["list"]>>;

export type WishlistEntry = WishlistPage["items"][number];

/* A card and the charter it names, the item shape charterSearch.results and listings.byIds also
 * return, which is why one card mapper serves all three screens. */
export type SavedCard = Omit<WishlistEntry, "savedAt">;

export type WishlistMode = "guest" | "user";
