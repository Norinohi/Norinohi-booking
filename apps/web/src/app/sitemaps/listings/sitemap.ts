import type { MetadataRoute } from "next";

import {
  entriesFor,
  LISTINGS_PER_SITEMAP,
  listingPaths,
  listingSitemapIds,
  safely,
} from "@/lib/sitemap";

/*
 * Split across numbered files, because one file cannot hold the catalog.
 *
 * Every listing is four locale entries carrying the full alternate set, ~3 KB, so 18,655 of them
 * come to ~55 MB against Google's 50 MB ceiling — a single file is rejected whole. The children
 * are `/sitemaps/listings/sitemap/0.xml` upward; `sitemap.xml` names each one.
 */
export async function generateSitemaps() {
  return (await listingSitemapIds()).map((id) => ({ id }));
}

/*
 * Listings carry no `lastModified` at all, rather than one stamped at request time.
 *
 * `new Date()` told Google every URL had just changed on every fetch, which is how a site teaches
 * it to ignore the field entirely. Omitting it is neutral; restoring it needs a real per-listing
 * timestamp, which the search contract does not expose yet.
 */
export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  /* Next hands the id back as a string, and as a promise since 16.0. */
  const index = Number(await id);
  const paths = await safely(listingPaths, "listings");
  const start = index * LISTINGS_PER_SITEMAP;

  return paths.slice(start, start + LISTINGS_PER_SITEMAP).flatMap((path) => entriesFor(path));
}
