import type { ListingFacetOption, ListingFacets } from "@yacht-charter/db/search";

/*
 * Facet reads for one search input, held in the API process for a few minutes.
 *
 * The web app caches the unscoped taxonomy for a day, but a browser narrowing the Where panel or
 * switching the price basis asks the API directly, and each answer is a full scan of the
 * catalogue.
 */

export const FACETS_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

interface Entry {
  expiresAt: number;
  value: Promise<ListingFacets>;
}

export function createFacetsCache(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();

  function read(key: string, load: () => Promise<ListingFacets>): Promise<ListingFacets> {
    const time = now();
    const hit = entries.get(key);
    if (hit && hit.expiresAt > time) return hit.value;

    const value = load();
    entries.delete(key);
    entries.set(key, { expiresAt: time + FACETS_TTL_MS, value });
    /* A failed read must be retried by the next caller, not served to them for five minutes. */
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });

    /* Map iteration is insertion order, so the first key is the oldest write. */
    if (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
    return value;
  }

  return { read, clear: () => entries.clear(), size: () => entries.size };
}

/**
 * An option with its empty editorial fields left out.
 *
 * Most groups have no facet_media rows, so nearly every model, marina and company carried six
 * nulls and the default `gridUsesHoverImage: true`, about half the response. The contract marks
 * them optional, and readers treat a missing field as they treat null.
 */
export function compactFacetOption(option: ListingFacetOption): ListingFacetOption {
  const compact: ListingFacetOption = { value: option.value, label: option.label };
  if (option.count !== undefined) compact.count = option.count;
  if (option.imageUrl != null) compact.imageUrl = option.imageUrl;
  if (option.hoverImageUrl != null) compact.hoverImageUrl = option.hoverImageUrl;
  if (option.gridUsesHoverImage === false) compact.gridUsesHoverImage = false;
  if (option.cloudinaryId != null) compact.cloudinaryId = option.cloudinaryId;
  if (option.description != null) compact.description = option.description;
  if (option.priceFromMinor != null) compact.priceFromMinor = option.priceFromMinor;
  if (option.pricePerPersonWeekMinor != null) {
    compact.pricePerPersonWeekMinor = option.pricePerPersonWeekMinor;
  }
  if (option.currency != null) compact.currency = option.currency;
  if (option.popularRank != null) compact.popularRank = option.popularRank;
  if (option.featuredRank != null) compact.featuredRank = option.featuredRank;
  return compact;
}

export function compactFacets(facets: ListingFacets): ListingFacets {
  const options = Object.fromEntries(
    Object.entries(facets.options).map(([group, list]) => [group, list.map(compactFacetOption)]),
  );
  return { ...facets, options: { ...facets.options, ...options } };
}
