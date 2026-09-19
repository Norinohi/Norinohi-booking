import { z } from "zod";

import extraLabelsJson from "./extra-labels.json" with { type: "json" };

/**
 * Curated labels for priced extras named the same way by more than one provider.
 *
 * Booking Manager publishes no translations at all, in any locale, and keys its extras per
 * base pair and boat class rather than against a dictionary — 19,482 service ids for 12,827
 * names, "Moorings Fee" alone being 5,628 of them. There is no id to translate against, so
 * these are matched on the name instead, and one entry serves every id that carries it.
 *
 * Scope is deliberate. What is here are generic charter fees and equipment: the words a
 * customer reads on a line item and has to understand before agreeing to pay. What is not here
 * is the long tail those 12,827 names mostly consist of — insurance terms with deductibles,
 * package contents, a boat's own name — because an approximate translation of contractual
 * wording is worse than the vendor's own English.
 *
 * `apply-translations.ts` writes these; `extra_label_translation` in the schema explains where
 * they sit relative to the provider's own wording, which always wins.
 *
 * Keys are the English name as the vendor writes it. Case and punctuation are folded by the
 * read join, so "Boat Cleaning" also covers "boat cleaning"; a plural is not folded, so
 * "Beach towel" and "Beach towels" are both listed.
 */
/**
 * One label set per locale the site serves.
 *
 * Annotated rather than inferred: past about three thousand entries TypeScript refuses to
 * serialize the inferred literal type (TS7056), and nothing reads these as literals -- the
 * only consumer walks `Object.entries` and parses the result. The set lives in
 * `extra-labels.json`.
 */
export interface ExtraLabel {
  de: string;
  es: string;
  uk: string;
  /*
   * Optional because only the busiest names carry them: the locales added later were curated
   * down the usage ranking `translations:missing-extras` prints, not across the whole set.
   */
  fr?: string;
  pl?: string;
  it?: string;
  nl?: string;
}

/** The curated set itself, keyed by the English name the vendor publishes. */
export interface ExtraLabelSet {
  [vendorName: string]: ExtraLabel;
}

export const extraLabels: ExtraLabelSet = z
  .record(
    z.string().min(1),
    z.object({
      de: z.string(),
      es: z.string(),
      uk: z.string(),
      fr: z.string().optional(),
      pl: z.string().optional(),
      it: z.string().optional(),
      nl: z.string().optional(),
    }),
  )
  .parse(extraLabelsJson);
