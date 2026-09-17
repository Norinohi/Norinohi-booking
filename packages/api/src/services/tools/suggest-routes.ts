import { suggestedRouteFor } from "@yacht-charter/db/routes/suggested-route";
import { base } from "@yacht-charter/db/schema/geography";
import { listPopularRoutes } from "@yacht-charter/db/search";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { suggestedRouteSchema } from "../../contracts/catalog";
import { popularRouteSchema, popularRoutesInputSchema } from "../../contracts/popular-yachts";
import { idSchema } from "../../contracts/primitives";
import { NotFoundError } from "../../errors";
import { defineTool } from "./tool";

const placeNameSchema = z.string().trim().min(1).max(120);

export const suggestRoutesInputSchema = popularRoutesInputSchema.extend({
  /** English country name, e.g. "Croatia". */
  country: placeNameSchema.optional(),
  /** English sailing region name, e.g. "Dalmatia". */
  region: placeNameSchema.optional(),
  /** A charter base id; adds the itinerary written for that base or its region. */
  baseId: idSchema.optional(),
});

export const suggestRoutesOutputSchema = z.object({
  popular: z.array(popularRouteSchema),
  /** Null unless `baseId` was given and somebody wrote a route for it or its region. */
  forBase: suggestedRouteSchema.nullable(),
});

export const suggestRoutes = defineTool({
  name: "suggestRoutes",
  description:
    "Suggest sailing routes. Returns the curated popular routes (title, nights, difficulty, stops with coordinates), optionally narrowed to a country or sailing region, and, when a charter base id is given, the itinerary written for that base or its region. Routes are hand-written; none are generated.",
  input: suggestRoutesInputSchema,
  output: suggestRoutesOutputSchema,
  run: async (ctx, input) => {
    const locale = input.locale ?? "en";
    const popular = await listPopularRoutes(ctx.db, {
      locale,
      limit: input.limit,
      country: input.country,
      region: input.region,
    });
    if (!input.baseId) return { popular, forBase: null };

    const [row] = await ctx.db
      .select({ id: base.id })
      .from(base)
      .where(eq(base.id, input.baseId))
      .limit(1);
    if (!row) throw new NotFoundError({ message: "Unknown base" });

    return { popular, forBase: await suggestedRouteFor(ctx.db, row.id, locale) };
  },
});
