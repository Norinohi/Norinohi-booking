import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { facetTranslationSource } from "./facet-media";
import { base, region } from "./geography";

/*
 * How demanding the sailing is, shown as a chip on a route card. Nullable on the table: the
 * routes that predate this column were written without one, and guessing would be worse than
 * leaving the chip off.
 */
export const suggestedRouteDifficulty = pgEnum("suggested_route_difficulty", [
  "easy",
  "moderate",
  "advanced",
]);

export const suggestedRouteKind = pgEnum("suggested_route_kind", [
  "seven_days",
  "fourteen_days",
  "family",
  "first_time_sailors",
  "active_sailing",
]);

/*
 * Hand-authored itineraries, the country -> region -> base -> route hierarchy of
 * docs/generated-content-audit.md §1. Nothing here is generated: a route exists only where
 * somebody wrote one, which is why the detail page's section can be absent.
 *
 * Targeting is two nullable foreign keys with a check rather than a join table because a route
 * is written from one starting point and read by one question - does this listing's base have a
 * route, and failing that does its region. A join table would let a row claim a base and a region
 * at once, and the read would have no rule for which of the two wins. `sort_order` picks between
 * several routes at the same level; a base route always beats a region one.
 */
export const suggestedRoute = pgTable(
  "suggested_route",
  {
    id: id("srt"),
    baseId: text("base_id").references(() => base.id, { onDelete: "cascade" }),
    regionId: text("region_id").references(() => region.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: suggestedRouteKind("kind").notNull(),
    nights: integer("nights").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    /*
     * Position in the site-wide "Popular sailing routes" list, null for a route that is not
     * in it. Distinct from `sort_order`, which picks between several routes attached to the
     * same base or region and says nothing about the marketplace as a whole. Named to match
     * facet_media.featured_rank so "featured" means one thing across the schema.
     */
    featuredRank: integer("featured_rank"),
    /* Mirrors facet_media: cloudinaryId wins when set, imageUrl covers local assets. */
    imageUrl: text("image_url"),
    cloudinaryId: text("cloudinary_id"),
    difficulty: suggestedRouteDifficulty("difficulty"),
    ...timestamps,
  },
  (t) => [
    index("suggested_route_base_idx").on(t.baseId),
    index("suggested_route_region_idx").on(t.regionId),
    index("suggested_route_featured_idx")
      .on(t.featuredRank)
      .where(sql`featured_rank is not null`),
    check("suggested_route_target_ck", sql`(${t.baseId} is null) <> (${t.regionId} is null)`),
  ],
);

/*
 * Per-locale title and description for a route.
 *
 * Mirrors facet_media_translation, down to sharing its `source` enum: `locale` is text so a
 * language is a data change, and a missing row falls back to the route's own English copy
 * rather than blanking the card. The three routes this replaces were translated through
 * next-intl message files, so without this table moving them into the database would have
 * lost German, Spanish and Ukrainian.
 */
export const suggestedRouteTranslation = pgTable(
  "suggested_route_translation",
  {
    id: id("srtt"),
    routeId: text("route_id")
      .notNull()
      .references(() => suggestedRoute.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title"),
    description: text("description"),
    source: facetTranslationSource("source").default("editorial").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("suggested_route_translation_locale_key").on(t.routeId, t.locale),
    index("suggested_route_translation_locale_idx").on(t.locale),
  ],
);

/*
 * `lat`/`lng` are not nullable, and that is the whole point of this table. The section they feed
 * used to place each stop at the charter base plus a fixed offset, so a marker labelled "Hvar"
 * was the marina shifted by -0.18/+0.15. A stop with no position is not a stop.
 */
export const suggestedRouteStop = pgTable(
  "suggested_route_stop",
  {
    id: id("srts"),
    routeId: text("route_id")
      .notNull()
      .references(() => suggestedRoute.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    sortOrder: integer("sort_order").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("suggested_route_stop_route_idx").on(t.routeId),
    uniqueIndex("suggested_route_stop_order_uq").on(t.routeId, t.sortOrder),
  ],
);

export const suggestedRouteRelations = relations(suggestedRoute, ({ one, many }) => ({
  base: one(base, { fields: [suggestedRoute.baseId], references: [base.id] }),
  region: one(region, { fields: [suggestedRoute.regionId], references: [region.id] }),
  stops: many(suggestedRouteStop),
  translations: many(suggestedRouteTranslation),
}));

export const suggestedRouteTranslationRelations = relations(
  suggestedRouteTranslation,
  ({ one }) => ({
    route: one(suggestedRoute, {
      fields: [suggestedRouteTranslation.routeId],
      references: [suggestedRoute.id],
    }),
  }),
);

export const suggestedRouteStopRelations = relations(suggestedRouteStop, ({ one }) => ({
  route: one(suggestedRoute, {
    fields: [suggestedRouteStop.routeId],
    references: [suggestedRoute.id],
  }),
}));
