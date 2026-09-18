/*
 * What a route shows where its author gave it no photo. A sailing yacht at sea rather than the
 * neutral "no image" tile: most routes have no photo yet, and a list of grey boxes read as a page
 * that failed to load rather than as routes waiting for pictures.
 */
export const ROUTE_FALLBACK_IMAGE = "/assets/home/popular/sailing-yacht.webp";

export const routeImage = (route: { imageUrl: string | null }) =>
  route.imageUrl ?? ROUTE_FALLBACK_IMAGE;
