import type { MetadataRoute } from "next";

import { entriesFor, listingPaths, safely } from "@/lib/sitemap";

/*
 * Listings carry no `lastModified` at all, rather than one stamped at request time.
 *
 * `new Date()` told Google every URL had just changed on every fetch, which is how a site teaches
 * it to ignore the field entirely. Omitting it is neutral; restoring it needs a real per-listing
 * timestamp, which the search contract does not expose yet.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await safely(listingPaths, "listings");
  return paths.flatMap((path) => entriesFor(path));
}
