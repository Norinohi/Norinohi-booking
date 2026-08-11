/**
 * Tags for the cached catalog reads (docs/adr/0002).
 *
 * The ADR shipped without tag invalidation on the reasoning that the catalog only
 * moves through provider sync, so the `days`/`hours` windows could simply catch
 * up. Running a real NauSYS import is what changed that: an operator who triggers
 * a sync and then looks at the site is exactly the person the ADR said did not
 * exist yet, and "wait up to a day" is the wrong answer for them.
 *
 * Only the catalog tier is tagged. Availability, quotes and repricing are never
 * cached in the first place, and nothing here should tempt anyone to start.
 */

/** Everything a provider sync can move: facets, cards, listing detail. */
export const CATALOG_TAG = "catalog";

/** One listing, so a single-listing change need not drop the whole catalog. */
export function listingTag(id: string): string {
  return `listing:${id}`;
}

/** Tags the revalidate webhook is allowed to act on. */
export function isKnownCacheTag(tag: string): boolean {
  return tag === CATALOG_TAG || tag.startsWith("listing:");
}
