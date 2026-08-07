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

export function labelOf(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function orderedValues(options: Option[], selected: string[]): string[] {
  const picked = new Set(selected);
  return options.filter((option) => picked.has(option.value)).map((option) => option.value);
}
