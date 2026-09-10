import {
  popularFacetListInputSchema,
  popularFacetListSchema,
  popularFacetSetInputSchema,
  popularFacetSetSchema,
} from "../contracts/popular-facets";
import { adminProcedure } from "../index";
import { listPopularFacets, setPopularFacets } from "../services/popular-facets-admin";
import { withJsonBodyExample } from "./openapi-examples";

/*
 * The curated order of a facet's values: which countries head the country picker, which boat
 * types head the boat-type one, which amenities a card shows first, and which destinations the
 * home page leads with.
 *
 * Two procedures rather than the create/update/delete/reorder next door in `admin-faq.ts`,
 * which this otherwise copies. A FAQ row is content that has to be born and killed; a curated
 * facet is a rank on a row that already describes a value the catalogue holds, so every edit
 * this screen can make -- ticking, unticking, moving up, moving down -- is one statement of the
 * whole ordered list. `set` says exactly that, and is the only shape in which no two values can
 * momentarily share a rank.
 */
export const popularFacetsAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/popular-facets/list",
      operationId: "listPopularFacets",
      summary: "List the curated order for one facet kind",
      description:
        "The curated list for one facet kind and surface, in rank order, plus everything that could be curated. `surface` picks between the two independent orders: `popular` pins values into the group at the top of a picker, `featured` orders the home page's sliders and grids. `available` is the union of the catalogue's live vocabulary and the rows already curated, so a value that has been pinned and has since sold out of boats is still listed — with a null count — rather than becoming impossible to remove.",
      tags: ["Admin"],
      successDescription: "The curated list and the values available to curate.",
      spec: withJsonBodyExample({ kind: "country", surface: "popular", locale: "en" }),
    })
    .input(popularFacetListInputSchema)
    .output(popularFacetListSchema)
    .handler(({ context, input }) => listPopularFacets(context.db, input)),
  set: adminProcedure
    .route({
      method: "POST",
      path: "/admin/popular-facets/set",
      operationId: "setPopularFacets",
      summary: "Replace the curated order for one facet kind",
      description:
        "Replaces the whole curated list with the values given, in the order given; ranks come out 1-based and contiguous. An empty array clears the curation, and the site falls back to the ordering it used before anything was curated. A value with no editorial row yet gets one. Writes an audit log entry holding the old and new order, then asks the web app to drop its cached catalog reads and reports whether it could — the facets read is cached for a day, so a save that could not reach the web app is live in the database but not yet on the site.",
      tags: ["Admin"],
      successDescription: "The saved list in its new order, and what the cache drop did.",
      spec: withJsonBodyExample({
        kind: "country",
        surface: "popular",
        values: ["croatia", "greece", "spain", "italy"],
      }),
    })
    .input(popularFacetSetInputSchema)
    .output(popularFacetSetSchema)
    .handler(({ context, input }) => setPopularFacets(context.db, context.session.user.id, input)),
};
