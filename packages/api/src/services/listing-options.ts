import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { yachtCategory } from "@yacht-charter/db/schema/taxonomy";
import { and, asc, eq, ilike } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type { yachtOptionsInputSchema, yachtOptionsSchema } from "../contracts/admin";

type YachtOptionsInput = z.infer<typeof yachtOptionsInputSchema>;
type YachtOptions = z.infer<typeof yachtOptionsSchema>;

/**
 * Typeahead over the search read model, backing the yacht picker in the admin
 * discount and price screens. A listing-search concern, not a discount one.
 */
export async function listYachtOptions(
  db: Database,
  input: YachtOptionsInput,
): Promise<YachtOptions> {
  const filters = [];
  if (input.query) filters.push(ilike(listingSearchDoc.title, `%${input.query}%`));
  if (input.categoryCode) {
    const [category] = await db
      .select({ name: yachtCategory.name })
      .from(yachtCategory)
      .where(eq(yachtCategory.code, input.categoryCode))
      .limit(1);
    // An unknown code must return nothing, not silently drop the filter and
    // offer the whole catalogue.
    if (!category) return { items: [] };

    // The search doc denormalizes the category by name, not by id.
    filters.push(eq(listingSearchDoc.category, category.name));
  }

  const rows = await db
    .select({
      id: listingSearchDoc.listingId,
      title: listingSearchDoc.title,
      categoryName: listingSearchDoc.category,
      baseName: listingSearchDoc.baseName,
    })
    .from(listingSearchDoc)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(listingSearchDoc.title))
    .limit(input.limit);

  return { items: rows };
}
