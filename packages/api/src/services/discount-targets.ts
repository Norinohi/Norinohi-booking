import { yachtCategory } from "@yacht-charter/db/schema/taxonomy";
import { sql } from "drizzle-orm";

/**
 * The group a category target names: "Motor yacht", not one vendor's row for it.
 *
 * A synced catalogue holds a category per vendor wording (NauSYS "Motor yacht", Booking Manager
 * "Motoryacht" and "Motor cruiser") under one canonical name, and the ids are minted per database.
 * The admin form used to send the seed's `cat_motor`, which no synced database has, so "Motor
 * Only" applied to nothing. A target keeps matching a category id too, for rows written that way.
 */
export const categoryGroupSql = sql<
  string | null
>`coalesce(${yachtCategory.canonicalName}, ${yachtCategory.name})`;
