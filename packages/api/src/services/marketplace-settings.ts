import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { marketplaceSetting } from "@yacht-charter/db/schema/admin";

import {
  displayCurrencyDefaultSchema,
  popularYachtsConfigSchema,
  providerKeyOutputSchema,
} from "../contracts/admin";
import type { Database, DatabaseExecutor } from "../context";
import { DEFAULT_PAYMENT_SETTINGS, type MarketplacePaymentSettings } from "./pricing";

/**
 * How the home page's popular-yachts slider is composed when nothing has been configured.
 *
 * The client's own figures: twelve boats, none over three years old, at most two from a country
 * and one from any single base, split across the five types they named. The mix is keyed by the
 * category's filter value, which is what the boat-type facet offers -- a key that matches no
 * category contributes nothing and is not an error, because the catalogue's vocabulary changes
 * with the fleet.
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
};

export type PopularYachtsConfig = z.infer<typeof popularYachtsConfigSchema>;

const SINGLETON_ID = "singleton";

/**
 * The order vendors are preferred in when nothing else separates them, most preferred first.
 *
 * Kept here rather than in `offer-choice.ts` so the value an admin saves and the value the sale
 * reads are the same one. `TRANSACTING_PREFERENCE` there is now only the fallback for a database
 * that has never been configured, and for the pure decision function's own tests.
 */
/** Restated here so an unwritten settings row prices exactly as a written default one does. */
export const DEFAULT_RELIABILITY_WINDOW_DAYS = 30;

export const DEFAULT_TRANSACTING_PREFERENCE = ["booking_manager", "nausys", "mock"] as const;

export type ProviderCode = z.infer<typeof providerKeyOutputSchema>;
export type DisplayCurrency = z.infer<typeof displayCurrencyDefaultSchema>;

/** Country code to currency. Open by nature: the keys are whatever countries someone names. */
export type CurrencyOverrides = Record<string, DisplayCurrency>;

/**
 * The stored default, narrowed to a currency this build can actually render.
 *
 * The column is plain text, so a value written before a currency was retired -- or by hand --
 * would otherwise reach a formatter that throws on it. Falling back to the base is the same
 * answer an unconfigured marketplace gets.
 */
function parseDisplayCurrency(stored: string): DisplayCurrency {
  const parsed = displayCurrencyDefaultSchema.safeParse(stored);
  return parsed.success ? parsed.data : "EUR";
}

/** The overrides, keeping only the pairs both sides of which this build understands. */
function parseCurrencyOverrides(stored: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(stored).flatMap(([country, currency]) => {
      const parsed = displayCurrencyDefaultSchema.safeParse(currency);
      if (!parsed.success || !/^[A-Za-z]{2}$/.test(country)) return [];
      return [[country.toUpperCase(), parsed.data] as const];
    }),
  );
}

/**
 * The stored order, keeping only codes this build knows.
 *
 * The column is `text[]`, so what comes back is whatever was written — including a provider that
 * has since been removed from the enum. Those are dropped rather than carried: an unknown code
 * cannot be ranked against a known one, and leaving it in would put a name on the admin screen
 * that matches nothing we can sell through.
 */
function parsePreference(stored: readonly string[]): ProviderCode[] {
  const known = stored.filter(
    (code): code is ProviderCode => providerKeyOutputSchema.safeParse(code).success,
  );
  return known.length > 0 ? known : [...DEFAULT_TRANSACTING_PREFERENCE];
}

export interface MarketplaceSettings {
  payment: MarketplacePaymentSettings;
  /** Provider codes, most preferred first. A code absent from it sorts after every code in it. */
  transactingPreference: ProviderCode[];
  /**
   * Whether the ranking compares charter rates rather than all-in totals. Off is what the
   * marketplace has always done; the client's agreed order is the other setting.
   */
  offerRankingUsesBasePrice: boolean;
  /** Whether catalogue cards show, sort and filter on the charter rate. Off by default. */
  catalogueShowsBasePrice: boolean;
  /** Whether a vendor's answer rate breaks a tie nothing above it could. Off by default. */
  offerRankingUsesReliability: boolean;
  /** The window that rate is measured over, in days. */
  reliabilityWindowDays: number;
  /** Whether prices are shown in the visitor's currency. Display only; off by default. */
  displayCurrencyEnabled: boolean;
  displayCurrencyDefault: DisplayCurrency;
  displayCurrencyByCountry: CurrencyOverrides;
  /** Whether the yacht search bar offers the free-text field. A testing aid, off by default. */
  nameSearchEnabled: boolean;
  /** How the home page's popular-yachts slider is composed. */
  popularYachts: PopularYachtsConfig;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

/**
 * The stored settings, or the defaults when nothing has been written.
 *
 * An absent row is not an error and not a reason to refuse a quote: a database that has never
 * seen the admin screen prices exactly as it did before the table existed, which is what
 * `DEFAULT_PAYMENT_SETTINGS` spells out.
 */
export async function getMarketplaceSettings(db: DatabaseExecutor): Promise<MarketplaceSettings> {
  const [row] = await db
    .select()
    .from(marketplaceSetting)
    .where(eq(marketplaceSetting.id, SINGLETON_ID))
    .limit(1);

  if (!row) {
    return {
      payment: DEFAULT_PAYMENT_SETTINGS,
      transactingPreference: [...DEFAULT_TRANSACTING_PREFERENCE],
      offerRankingUsesBasePrice: false,
      catalogueShowsBasePrice: false,
      offerRankingUsesReliability: false,
      reliabilityWindowDays: DEFAULT_RELIABILITY_WINDOW_DAYS,
      displayCurrencyEnabled: false,
      displayCurrencyDefault: "EUR",
      displayCurrencyByCountry: {},
      nameSearchEnabled: false,
      popularYachts: DEFAULT_POPULAR_YACHTS,
      updatedAt: null,
      updatedByUserId: null,
    };
  }

  return {
    payment: {
      source: row.paymentPolicySource,
      mode: row.marketplaceMode,
      // `numeric` arrives as a string, and a percentage read as NaN would silently become the
      // default rather than the figure an operator typed.
      depositPct: Number(row.marketplaceDepositPct),
      enforceLeadTime: row.enforceDepositLeadTime,
      leadTimeDays: row.depositLeadTimeDays,
    },
    /* An empty array would rank every vendor equally and leave the sale to the offer id, which
       is not a preference anybody meant to express. */
    transactingPreference: parsePreference(row.transactingPreference),
    offerRankingUsesBasePrice: row.offerRankingUsesBasePrice,
    catalogueShowsBasePrice: row.catalogueShowsBasePrice,
    offerRankingUsesReliability: row.offerRankingUsesReliability,
    reliabilityWindowDays: row.reliabilityWindowDays,
    displayCurrencyEnabled: row.displayCurrencyEnabled,
    displayCurrencyDefault: parseDisplayCurrency(row.displayCurrencyDefault),
    displayCurrencyByCountry: parseCurrencyOverrides(row.displayCurrencyByCountry),
    nameSearchEnabled: row.nameSearchEnabled,
    /*
     * Parsed here rather than trusted: the column is jsonb, so what the driver returns is
     * whatever was written, by a version of this code that may no longer exist. A shape that no
     * longer parses falls back to the defaults -- the same answer an unconfigured marketplace
     * gets -- rather than composing the slider from half-read numbers.
     */
    popularYachts:
      popularYachtsConfigSchema.safeParse(row.popularYachtsConfig).data ?? DEFAULT_POPULAR_YACHTS,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
  };
}

export interface UpdateMarketplaceSettingsInput {
  payment: MarketplacePaymentSettings;
  transactingPreference: ProviderCode[];
  offerRankingUsesBasePrice: boolean;
  catalogueShowsBasePrice: boolean;
  offerRankingUsesReliability: boolean;
  reliabilityWindowDays: number;
  displayCurrencyEnabled: boolean;
  displayCurrencyDefault: DisplayCurrency;
  displayCurrencyByCountry: CurrencyOverrides;
  nameSearchEnabled: boolean;
  popularYachts: PopularYachtsConfig;
  actorUserId: string | null;
}

/**
 * Writes the singleton, creating it on first save.
 *
 * `onConflictDoUpdate` rather than a read-then-write: two admins saving at once would
 * otherwise both insert, and the check constraint would turn the loser into a 500 on a screen
 * where the honest outcome is simply that the last save wins.
 */
export async function updateMarketplaceSettings(
  db: Database,
  input: UpdateMarketplaceSettingsInput,
): Promise<MarketplaceSettings> {
  /* Read before the write, because whether the catalogue has to be rebuilt is a question about
     what changed, and after the upsert there is nothing left to compare against. */
  const before = await getMarketplaceSettings(db);

  const values = {
    paymentPolicySource: input.payment.source,
    marketplaceMode: input.payment.mode,
    marketplaceDepositPct: input.payment.depositPct.toFixed(4),
    enforceDepositLeadTime: input.payment.enforceLeadTime,
    depositLeadTimeDays: input.payment.leadTimeDays,
    transactingPreference: input.transactingPreference,
    offerRankingUsesBasePrice: input.offerRankingUsesBasePrice,
    catalogueShowsBasePrice: input.catalogueShowsBasePrice,
    offerRankingUsesReliability: input.offerRankingUsesReliability,
    reliabilityWindowDays: input.reliabilityWindowDays,
    displayCurrencyEnabled: input.displayCurrencyEnabled,
    displayCurrencyDefault: input.displayCurrencyDefault,
    displayCurrencyByCountry: input.displayCurrencyByCountry,
    nameSearchEnabled: input.nameSearchEnabled,
    popularYachtsConfig: input.popularYachts,
    updatedByUserId: input.actorUserId,
  };

  await db
    .insert(marketplaceSetting)
    .values({ id: SINGLETON_ID, ...values })
    .onConflictDoUpdate({
      target: marketplaceSetting.id,
      set: { ...values, updatedAt: new Date() },
    });

  const saved = await getMarketplaceSettings(db);

  if (!sameOrder(before.transactingPreference, saved.transactingPreference)) {
    startPreferenceRebuild(db);
  }

  /*
   * The price basis needs no rebuild, only a cache drop: both figures are written on every
   * projection, so flipping this changes which column the reads pick rather than what the
   * documents hold. Worth stating beside the neighbour that does the opposite -- the two look
   * like the same kind of switch and are not.
   */
  if (before.catalogueShowsBasePrice !== saved.catalogueShowsBasePrice) {
    void revalidateCatalogCache();
  }

  return saved;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

/**
 * The catalogue's own copy of the preference, brought up to date after a save.
 *
 * The sale and the availability calendar read the setting directly and follow it on the next
 * request. The search documents do not: `provider_rank` is resolved while they are built, so
 * until they are rebuilt a card goes on advertising the vendor the old order picked while the
 * quote beneath it sells the one the new order picks. That disagreement is the whole reason
 * this exists.
 *
 * Detached from the request in the shape `provider-sync.ts` already uses for its runs: a full
 * rebuild is minutes of work on the production catalogue and the admin's save is not a place to
 * spend them. The cache drop rides on completion rather than on the save, because the documents
 * have not moved until the rebuild finishes and revalidating early would refill the cache from
 * the state being replaced.
 *
 * The guard is per process, not per deployment. Two web instances saving at once would each
 * start a rebuild, which is wasteful rather than wrong: the rebuild is an upsert over the same
 * rows and the second run writes what the first one did.
 */
let rebuildInFlight: Promise<unknown> | null = null;

function startPreferenceRebuild(db: Database): void {
  if (rebuildInFlight) return;

  rebuildInFlight = rebuildSearchReadModelsAfterSync(db)
    .then(() => revalidateCatalogCache())
    .catch(() => undefined)
    .finally(() => {
      rebuildInFlight = null;
    });

  void rebuildInFlight;
}
