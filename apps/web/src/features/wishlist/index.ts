/*
 * Client-safe public API. `prefetchWishlist` is deliberately absent: api/server.ts
 * is server-only, and re-exporting it here would drag it into the client bundle of
 * every card that imports WishlistButton. The route imports it from api/server directly.
 */
export { default as WishlistProvider } from "./components/wishlist-provider";
export { default as WishlistButton } from "./components/wishlist-button";
export { default as WishlistScreen } from "./components/wishlist-screen";
export { useWishlist, useWishlistToggle } from "./hooks/use-wishlist";
