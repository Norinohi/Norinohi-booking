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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { base, region } from "./geography";

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
    ...timestamps,
  },
  (t) => [
    index("suggested_route_base_idx").on(t.baseId),
    index("suggested_route_region_idx").on(t.regionId),
    check("suggested_route_target_ck", sql`(${t.baseId} is null) <> (${t.regionId} is null)`),
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
}));

export const suggestedRouteStopRelations = relations(suggestedRouteStop, ({ one }) => ({
  route: one(suggestedRoute, {
    fields: [suggestedRouteStop.routeId],
    references: [suggestedRoute.id],
  }),
}));
