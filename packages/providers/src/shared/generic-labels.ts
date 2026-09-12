/**
 * What a priced line is called when nothing else names it.
 *
 * Both adapters fall back to these, and neither can do better on its own: NauSYS sends only a
 * service id on an offer extra, and Booking Manager sends a name it sometimes leaves blank. So
 * a line wearing one of these carries no information about what was charged -- it is our own
 * placeholder, not the operator's wording.
 *
 * Shared so the callers that have to recognise one can, rather than comparing against a string
 * they have copied. `learnExtrasFromQuote` is the reason: a placeholder must never be written
 * into the catalogue as if the vendor had said it.
 */
export const DEFAULT_LINE_LABELS = {
  base: "Charter price",
  extra: "Charter extra",
  discount: "Charter discount",
} as const;

const GENERIC = new Set<string>(Object.values(DEFAULT_LINE_LABELS));

/** Whether a line's label is one of ours rather than something the vendor said. */
export function isGenericLineLabel(label: string): boolean {
  return GENERIC.has(label.trim());
}
