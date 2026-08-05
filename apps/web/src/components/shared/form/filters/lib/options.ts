export type Option = { value: string; label: string };

export function labelOf(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function orderedValues(options: Option[], selected: string[]): string[] {
  const picked = new Set(selected);
  return options.filter((option) => picked.has(option.value)).map((option) => option.value);
}
