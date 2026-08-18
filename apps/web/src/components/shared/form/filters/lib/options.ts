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
};

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
