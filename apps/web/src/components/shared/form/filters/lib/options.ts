import { slugToLabel } from "@/lib/slug-to-label";

export type Option = {
  value: string;
  label: string;
  count?: number;
  /* Editorial fields — present only for facet groups backed by facet_media rows. */
  imageUrl?: string | null;
  cloudinaryId?: string | null;
  description?: string | null;
  priceFromMinor?: number | null;
  currency?: string | null;
  /* Curated order. `popularRank` pins the value into a picker's "Popular" group; `featuredRank`
     orders the home page's sliders. Null on any value nobody has curated. */
  popularRank?: number | null;
  featuredRank?: number | null;
};

/**
 * Splits options into the curated group and the rest, or answers null when nothing is curated.
 *
 * Null rather than "one group holding everything" so the caller can fall back to the flat list:
 * a single heading over every option is noise, and it is the state every facet kind is in until
 * somebody opens the admin screen.
 *
 * A pinned value is not repeated below. Two checkboxes for one selection would look like two
 * selections, and unticking one of them would appear to do nothing to the other.
 */
export function partitionByPopularity(
  options: Option[],
): { popular: Option[]; rest: Option[] } | null {
  const ranked: (Option & { popularRank: number })[] = [];
  for (const option of options) {
    const rank = option.popularRank;
    if (rank === null || rank === undefined) continue;
    ranked.push({ ...option, popularRank: rank });
  }

  const popular = ranked.sort((left, right) => left.popularRank - right.popularRank);

  if (popular.length === 0) return null;

  const pinned = new Set(popular.map((option) => option.value));
  return { popular, rest: options.filter((option) => !pinned.has(option.value)) };
}

/**
 * A value with no option behind it is un-slugged rather than printed raw.
 *
 * Catalogue pages pin facets the option lists do not carry — a city, or a builder filed under
 * the model key — and those used to surface as "Model: bavaria" in a chip.
 */
export function labelOf(options: Option[], value: string): string {
  const option = options.find((candidate) => candidate.value === value);
  return option?.label ?? slugToLabel(value);
}

export function orderedValues(options: Option[], selected: string[]): string[] {
  const picked = new Set(selected);
  return options.filter((option) => picked.has(option.value)).map((option) => option.value);
}
