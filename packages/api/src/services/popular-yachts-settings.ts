import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { marketplaceSetting } from "@yacht-charter/db/schema/admin";

import { popularDestinationsSchema, popularYachtsConfigSchema } from "../contracts/admin";
import type { Database, DatabaseExecutor } from "../context";
import { writeAuditLog } from "./audit";

export type PopularYachtsConfig = z.infer<typeof popularYachtsConfigSchema>;

/**
 * How the home page's popular-yachts slider is composed when nothing has been configured.
 *
 * The client's own figures: twelve boats, none over three years old, at most two from a country
 * and one from any single base, split across the five types they named, drawn from the five
 * countries and the places in them they listed. The places carry the spellings the two vendors
 * actually use beside the client's own ("Lavrio" is how NauSYS writes Lavrion). The mix is keyed
 * by the category's filter value, which is what the boat-type facet offers -- a key that matches
 * no category contributes nothing and is not an error, because the catalogue's vocabulary
 * changes with the fleet.
 */
export const DEFAULT_POPULAR_YACHTS: PopularYachtsConfig = {
  limit: 12,
  maxAgeYears: 3,
  maxPerCountry: 2,
  maxPerBase: 1,
  mix: {
    catamaran: 3,
    "sailing-yacht": 3,
    "motor-boat": 2,
    "motor-yacht": 2,
    "motor-catamaran": 2,
  },
  destinations: [
    {
      country: "Croatia",
      places: ["Split / Trogir", "Zadar / Sukošan", "Dubrovnik", "Istra / Istria / Pula / Rovinj"],
    },
    {
      country: "Greece",
      places: [
        "Lefkada / Lefkas",
        "Athens / Alimos",
        "Lavrion / Lavrio",
        "Cyclades / Kos",
        "Dodecanese",
        "Sporades",
      ],
    },
    { country: "Spain", places: ["Ibiza", "Palma", "Mahón / Menorca", "Tenerife"] },
    {
      country: "Italy",
      places: ["Portisco / Olbia", "Portorosa / Milazzo", "Salerno", "Punta Ala", "Palermo"],
    },
    { country: "Turkey", places: ["Göcek", "Bodrum", "Fethiye", "Marmaris"] },
  ],
};

/*
 * A row saved before destinations existed has no such key. It gets the client's list rather than
 * failing the parse, which would have thrown away the caps and the mix an admin did set.
 */
const storedPopularYachtsSchema = popularYachtsConfigSchema.extend({
  destinations: popularDestinationsSchema.default(DEFAULT_POPULAR_YACHTS.destinations),
});

const SINGLETON_ID = "singleton";
const ENTITY_TYPE = "popular_yachts_config";

/**
 * The slider's configuration, or the defaults when nothing has been written.
 *
 * Parsed rather than trusted: the column is jsonb, so what the driver returns is whatever was
 * written, by a version of this code that may no longer exist. A shape that no longer parses
 * falls back to the defaults rather than composing the slider from half-read numbers.
 */
export async function getPopularYachtsConfig(db: DatabaseExecutor): Promise<PopularYachtsConfig> {
  const [row] = await db
    .select({ config: marketplaceSetting.popularYachtsConfig })
    .from(marketplaceSetting)
    .where(eq(marketplaceSetting.id, SINGLETON_ID))
    .limit(1);

  return storedPopularYachtsSchema.safeParse(row?.config).data ?? DEFAULT_POPULAR_YACHTS;
}

/**
 * Saves the slider's configuration and drops the cached home page.
 *
 * Writes the one column only. It shares the settings singleton with the payment flow, and a save
 * from this screen that rewrote the whole row would undo whatever the settings screen saved in
 * the meantime. The home page read is cached for hours, so without the cache drop an edit would
 * look like it had not worked.
 */
export async function updatePopularYachtsConfig(
  db: Database,
  actorUserId: string,
  config: PopularYachtsConfig,
) {
  const before = await getPopularYachtsConfig(db);

  await db.transaction(async (tx) => {
    await tx
      .insert(marketplaceSetting)
      .values({ id: SINGLETON_ID, popularYachtsConfig: config, updatedByUserId: actorUserId })
      .onConflictDoUpdate({
        target: marketplaceSetting.id,
        set: { popularYachtsConfig: config, updatedByUserId: actorUserId, updatedAt: new Date() },
      });

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: SINGLETON_ID,
      before,
      after: config,
    });
  });

  const cache = await revalidateCatalogCache();
  return { config: await getPopularYachtsConfig(db), cache };
}
