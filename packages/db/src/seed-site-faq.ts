/**
 * The site-wide FAQ: twenty questions in six categories, as the client wrote them, answered
 * in the four locales the site serves.
 *
 * Site-wide entries are `faq` rows with a null `listing_id`, so nothing here references a
 * listing and this seeds a provider-synced database as readily as the mock fixtures.
 * `pnpm --filter @yacht-charter/db seed --faq-only` is that path.
 *
 * The answers are written against what this repository and the synced catalogue actually do -
 * the booking state machine, the sync schedules, the payment policy in `resolvePaymentPolicy`,
 * the Stripe path, the crew and licence derivation, and the extras the vendors really charge.
 * Where a term is the operator's to set rather than ours - cancellation, rescheduling, what a
 * charter pack contains - the answer says so instead of naming a figure. That hedge is the
 * accurate statement, and the same one `cancellationPaymentPolicies: varies_by_selection`
 * already makes on the listing page; do not sharpen it into a number in any locale.
 *
 * Ukrainian is the client's own wording. The other three are translations of it, because the
 * detail read matches locale exactly with no fallback - an entry missing in a locale is simply
 * absent from that page rather than served in Ukrainian.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./index";
import { faq, faqCategory } from "./schema/content";
import siteFaqJson from "./site-faq.json" with { type: "json" };

type FaqCategoryValue = (typeof faqCategory.enumValues)[number];

/** The site's four locales; `en` is the default. */
const LOCALES = ["en", "de", "es", "uk"] as const;

type Locale = (typeof LOCALES)[number];

/** Every locale is required: a question present in three of four is a hole in one page. */
type Localized = Record<Locale, string>;

type SiteFaqEntry = {
  category: FaqCategoryValue;
  question: Localized;
  answer: Localized;
};

const localizedSchema = z.object({
  en: z.string(),
  de: z.string(),
  es: z.string(),
  uk: z.string(),
});

const entries: SiteFaqEntry[] = z
  .array(
    z.object({
      category: z.enum(faqCategory.enumValues),
      question: localizedSchema,
      answer: localizedSchema,
    }),
  )
  .parse(siteFaqJson);

/**
 * Ids are derived from locale, category and position so a re-run edits the row it wrote last
 * time rather than adding a second copy of the question. Reordering a category therefore
 * rewrites the entries in it, which is the trade that keeps `site-faq.json` the single source.
 * The locale sits in the id because the same question is a separate row in each of the four.
 */
function rows(): (typeof faq.$inferInsert)[] {
  return LOCALES.flatMap((locale) => {
    const seen = new Map<FaqCategoryValue, number>();

    return entries.map((entry) => {
      const position = (seen.get(entry.category) ?? 0) + 1;
      seen.set(entry.category, position);

      return {
        id: `faq_site_${locale}_${entry.category}_${position}`,
        listingId: null,
        category: entry.category,
        locale,
        question: entry.question[locale],
        answer: entry.answer[locale],
        sortOrder: position,
      };
    });
  });
}

export async function seedSiteFaq(database = db): Promise<number> {
  const values = rows();

  await database
    .insert(faq)
    .values(values)
    .onConflictDoUpdate({
      target: faq.id,
      set: {
        category: sql.raw("excluded.category"),
        locale: sql.raw("excluded.locale"),
        question: sql.raw("excluded.question"),
        answer: sql.raw("excluded.answer"),
        sortOrder: sql.raw("excluded.sort_order"),
      },
    });

  return values.length;
}
