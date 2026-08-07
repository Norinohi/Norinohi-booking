import type { AppRouterClient } from "@yacht-charter/api/routers/index";

export type WishlistPage = Awaited<ReturnType<AppRouterClient["wishlist"]["list"]>>;

export type WishlistEntry = WishlistPage["items"][number];

/* listingSummarySchema — the shape charterSearch.results and listings.byIds also
 * return, which is why one card mapper serves all three screens. */
export type ListingSummary = WishlistEntry["listing"];

export type WishlistMode = "guest" | "user";
