import { providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../registry";
import { parseNausysDate } from "../shared/dates";
import { ContractError } from "../shared/errors";
import { nausysConfirmedCursorSchema, streamNausysConfirmedOffers } from "./confirmed-offers";
import { decimalStringToMinor } from "../shared/money";
import { stableSourceHash } from "../shared/raw-retention";
import type {
  AvailabilityScope,
  AvailabilitySource,
  ConfirmedOfferPage,
  OccupancyDump,
  OccupiedInterval,
} from "../sync/availability-writer";
import type { SeasonalPrice } from "../sync/price-writer";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import type { SyncReporter } from "../sync/runner";
import type { NausysClient } from "./client";
import {
  nausysEndpoints,
  type restOccupancyReservationSchema,
  restOccupancyResponseSchema,
} from "./endpoints";

/**
 * The two NauSYS availability sources, and they answer opposite questions.
 *
 * `occupancy` is cheap and complete: one call per (company, year) returning every
 * RESERVATION and OPTION. It never says what is free, which is why
 * `sync/availability-writer.ts` has to derive that.
 *
 * `freeYachtsSearch` is the accurate one and says exactly what is free at what
 * price, but it is priced per (destination, week) and runs here on the sync lane,
 * one call at a time, so it is only ever run over a bounded hot window.
 *
 * Raw retention happens in the transport (`NausysClient`'s `onRawResponse`), before
 * anything here parses a field.
 */

type RestOccupancyReservation = z.infer<typeof restOccupancyReservationSchema>;

/** Occupancy is addressed by year, or by the vendor's own season id on `occupancy2`. */
export type NausysOccupancyScope =
  | { companyId: string; year: number }
  | { companyId: string; seasonId: string | number };

export interface NausysOccupancyDump {
  companyId: string;
  year?: number;
  seasonId?: string;
  reservations: RestOccupancyReservation[];
}

export async function fetchNausysOccupancy(
  client: NausysClient,
  scope: NausysOccupancyScope,
): Promise<NausysOccupancyDump> {
  const endpoint =
    "seasonId" in scope
      ? nausysEndpoints.availability.occupancy2(scope.companyId, scope.seasonId)
      : nausysEndpoints.availability.occupancy(scope.companyId, scope.year);

  // Occupancy takes the TOP-LEVEL {username, password} body despite living under
  // `yachtReservation/v6` next to `freeYachts`, which takes the nested one.
  const response = await client.catalogueCall(endpoint, restOccupancyResponseSchema);

  return {
    companyId: scope.companyId,
    ...("seasonId" in scope
      ? { seasonId: String(scope.seasonId) }
      : { year: response.year ?? scope.year }),
    reservations: response.reservations ?? [],
  };
}

/**
 * Lossy for one yacht, never for the scope - the same bargain
 * `mapBookingManagerOccupancyDump` struck, and for the same reason.
 *
 * A dropped reservation is a week we would then advertise as free, so a row that
 * cannot be read still costs its yacht the whole calendar rather than being
 * silently skipped. What it must not cost is every other company: a throw out of
 * here is a `ContractError`, which `isFatalByDefault` treats as terminal, so before
 * this one unreadable row aborted the entire account's availability sync.
 */
const OCCUPANCY_STATUS = {
  RESERVATION: "occupied",
  OPTION: "option",
  SERVICE: "blocked",
} as const satisfies Record<
  RestOccupancyReservation["reservationType"],
  OccupiedInterval["status"]
>;

/** How many of a dump's messages are worth carrying; the rest repeat. */
const MAX_REPORTED_ISSUES = 5;

/**
 * Null for a reservation that asserts nothing, which is not the same as one that
 * cannot be read.
 *
 * NauSYS publishes same-day RESERVATION rows as a matter of course - 33 of one
 * company's 5122, spread across 16 of its 282 yachts, on the run that first surfaced
 * this. They block no night: an interval whose end equals its start consumes nothing
 * in `freePeriodsFrom` and would persist as a zero-length `availability_slot`, so
 * dropping it is exactly equivalent to keeping it, minus the row.
 *
 * A period that runs backwards is the different case this used to be lumped in with.
 * There is no safe reading of it, so it still throws and its yacht is quarantined.
 */
export function mapOccupancyReservation(
  reservation: RestOccupancyReservation,
): OccupiedInterval | null {
  const startDate = parseNausysDate(reservation.periodFrom);
  const endDate = parseNausysDate(reservation.periodTo);

  if (endDate < startDate) {
    throw new ContractError(
      `NauSYS reservation ${reservation.id} ends ${endDate} before it starts ${startDate}`,
      { endpoint: "occupancy", payload: { id: reservation.id, yachtId: reservation.yachtId } },
    );
  }

  if (endDate === startDate) return null;

  return {
    externalYachtId: String(reservation.yachtId),
    startDate,
    endDate,
    // An OPTION blocks the yacht for as long as it stands, so it is unbookable for
    // us; it is kept distinct from a RESERVATION because it can lapse. SERVICE is a
    // maintenance or out-of-fleet block, which is never bookable at all.
    status: OCCUPANCY_STATUS[reservation.reservationType],
    sourceHash: stableSourceHash(reservation),
  };
}

export function mapOccupancyDump(dump: NausysOccupancyDump): OccupancyDump {
  const intervals: OccupiedInterval[] = [];
  const quarantinedYachtIds = new Set<string>();
  const issues: string[] = [];

  for (const reservation of dump.reservations) {
    try {
      const interval = mapOccupancyReservation(reservation);
      if (interval) intervals.push(interval);
    } catch (error) {
      quarantinedYachtIds.add(String(reservation.yachtId));
      if (issues.length < MAX_REPORTED_ISSUES) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  // A quarantined yacht's readable rows go too: half a calendar is not a calendar,
  // and the sweep it is excluded from is the only thing that would have tidied up
  // the slots it did restamp.
  const kept =
    quarantinedYachtIds.size === 0
      ? intervals
      : intervals.filter((interval) => !quarantinedYachtIds.has(interval.externalYachtId));

  const mapped: OccupancyDump = { intervals: kept };
  if (quarantinedYachtIds.size > 0) {
    mapped.quarantinedYachtIds = [...quarantinedYachtIds];
    mapped.issues = issues;
  }
  return mapped;
}

/* Lives with the pass that produces them; re-exported because this is the module the
   availability source is assembled in. */
export { mapFreeYachtToConfirmedOffer } from "./confirmed-offers";

/* -------------------------------------------------------------- hot window */

export interface NausysHotWindow {
  /** ISO check-in and check-out of the week being priced. */
  periodFrom: string;
  periodTo: string;
  countries?: number[];
  regions?: number[];
  locations?: number[];
}

export const nausysHotWindowCursorSchema = z.object({
  windowIndex: z.number().int().min(0),
  page: z.number().int().min(1),
});
export type NausysHotWindowCursor = z.infer<typeof nausysHotWindowCursorSchema>;

export function parseNausysHotWindowCursor(value: unknown): NausysHotWindowCursor | null {
  const parsed = nausysHotWindowCursorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------------------ source */

export interface NausysAvailabilitySourceOptions {
  client: NausysClient;
  /** External charter company ids, from `CatalogueResolver.listExternalCompanyIds()`. */
  companyIds: string[];
  /** One occupancy call per (company, year); the writer sweeps a year at a time. */
  years: number[];
  /** Destination and week combinations the accurate pass walks, in priority order. */
  hotWindows?: NausysHotWindow[];
  /**
   * Every NauSYS hull we list inside `companyIds`. Absent, the confirming pass is skipped:
   * it prices our own fleet by id, so with no ids there is nothing to ask about.
   */
  loadYachtIds?: () => Promise<readonly string[]>;
  currency?: string;
  resultsPerPage?: number;
}

export function createNausysAvailabilitySource(
  options: NausysAvailabilitySourceOptions,
): AvailabilitySource {
  const { client } = options;
  const hotWindows = options.hotWindows ?? [];

  const source: AvailabilitySource = {
    listScopes(): Promise<AvailabilityScope[]> {
      const scopes: AvailabilityScope[] = [];
      for (const companyId of options.companyIds) {
        for (const year of options.years) {
          scopes.push({ scopeKey: companyId, year });
        }
      }
      return Promise.resolve(scopes);
    },

    async fetchOccupancy(scope) {
      const dump = await fetchNausysOccupancy(client, {
        companyId: scope.scopeKey,
        year: scope.year,
      });
      return mapOccupancyDump(dump);
    },
  };

  if (hotWindows.length === 0 || !options.loadYachtIds) return source;
  const loadYachtIds = options.loadYachtIds;

  return {
    ...source,
    /*
     * `freeYachts`, a batch of our own hulls at a time, rather than `freeYachtsSearch` a page
     * of the vendor's fleet at a time. `streamNausysConfirmedOffers` carries the measurements
     * behind that: the search endpoint costs ~28s per call whatever it is asked for and never
     * returns the obligatory extras a card has to add to the rate.
     */
    searchConfirmed(resume): AsyncIterable<ConfirmedOfferPage> {
      /* Parsed here, where the writer hands back whatever the jsonb cursor column held: an
         unreadable one is a sweep that starts over, which costs calls rather than correctness. */
      const from = nausysConfirmedCursorSchema.safeParse(resume).data ?? { windowIndex: 0 };

      return streamNausysConfirmedOffers(
        {
          client,
          periods: hotWindows.map((window) => ({
            startDate: window.periodFrom,
            endDate: window.periodTo,
          })),
          loadYachtIds,
          companyIds: options.companyIds,
          ...(options.currency ? { currency: options.currency } : null),
        },
        from,
      );
    },
  };
}

/* -------------------------------------------------------------- price book */

/**
 * A `catalogue/v6/priceLists` entry is a MATRIX, not a list of priced periods:
 * `columns[i]` holds the date ranges and `rows[].prices[i]` the price for them,
 * joined by position alone. One column may carry several disjoint periods (a
 * shoulder rate reused), and the currency belongs to the list, not to the row.
 *
 * `vatInPrice` ("I" included, "E" excluded) also rides on the list, and it does
 * vary: the recorded season carries four "I" lists and one "E". Nothing here acts
 * on it yet, so a mapped amount is whatever the list said it was. Whether a
 * displayed "from" price is gross or net is still an open commercial question:
 * NauSYS settled the transacting amount (Aug 2026, `clientPrice` is final and VAT
 * inclusive) but said nothing about these catalogue lists, which no one is billed
 * from. VENDOR QUESTION Q-PRICELIST-VAT.
 */
const priceListPeriodSchema = z.looseObject({
  /** Both ends inclusive, as the vendor states them; readers of the stored period are half-open. */
  periodFrom: z.string(),
  periodTo: z.string(),
});

const priceListColumnSchema = z.looseObject({
  periods: z.array(priceListPeriodSchema),
});

const priceListRowSchema = z.looseObject({
  yachtId: z.union([z.number().int(), z.string()]),
  prices: z.array(z.string()),
});

/** Rows stay `unknown` here so one unreadable row costs a row, not the whole list. */
const priceListSchema = z.looseObject({
  currency: z.string(),
  type: z.string().optional(),
  columns: z.array(priceListColumnSchema),
  rows: z.array(z.unknown()),
});

/**
 * `type` is WEEKLY or DAILY. Only the weekly rate is mapped: the writer stamps a
 * seasonal price onto a whole synthesized charter period, so a daily rate would
 * price a week at a seventh of its worth. Scaling it by seven is not available
 * either, since the two are not proportional in the recorded response: yacht
 * 22291115 is 1000/day against weeks of 3650 to 6000. A list with no `type` is
 * skipped for the same reason, as an untyped amount could be either.
 */
const WEEKLY_PRICE_LIST_TYPE = "WEEKLY";

/** A whole-fleet contract break would otherwise put thousands of rows in one error. */
const MAX_REPORTED_PRICE_ISSUES = 20;

export interface NausysPriceListRecord {
  externalId: string;
  payload: unknown;
}

export type NausysPriceListIssueReason =
  | "list_unreadable"
  | "unsupported_currency"
  | "unsupported_unit"
  | "row_unreadable"
  | "column_count_mismatch"
  | "malformed_period"
  | "malformed_price";

/** What we refused to read, so a missing price can be traced to a decision. */
export interface NausysPriceListIssue {
  priceListId: string;
  externalYachtId?: string;
  reason: NausysPriceListIssueReason;
  detail: string;
}

/** Pure `price_list` records to seasonal prices, keyed by the vendor's yacht id. */
export function mapNausysPriceLists(
  records: readonly NausysPriceListRecord[],
  onIssue?: (issue: NausysPriceListIssue) => void,
): Map<string, SeasonalPrice[]> {
  const byYacht = new Map<string, SeasonalPrice[]>();

  for (const record of records) {
    const parsed = priceListSchema.safeParse(record.payload);
    if (!parsed.success) {
      onIssue?.({
        priceListId: record.externalId,
        reason: "list_unreadable",
        detail: parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
      });
      continue;
    }

    const list = parsed.data;
    const currency = list.currency.trim().toUpperCase();
    if (currency.length !== 3) {
      onIssue?.({
        priceListId: record.externalId,
        reason: "unsupported_currency",
        detail: list.currency,
      });
      continue;
    }
    if (list.type?.trim().toUpperCase() !== WEEKLY_PRICE_LIST_TYPE) {
      onIssue?.({
        priceListId: record.externalId,
        reason: "unsupported_unit",
        detail: list.type ?? "(missing)",
      });
      continue;
    }

    const columns = list.columns.map((column) =>
      readColumnPeriods(column.periods, record.externalId, onIssue),
    );

    for (const raw of list.rows) {
      const row = priceListRowSchema.safeParse(raw);
      if (!row.success) {
        onIssue?.({
          priceListId: record.externalId,
          reason: "row_unreadable",
          detail: row.error.issues.map((issue) => issue.path.join(".")).join(", "),
        });
        continue;
      }

      const externalYachtId = String(row.data.yachtId);
      // The whole risk of a positional join. A short or long row means we no longer
      // know which rate belongs to which season, and zipping what we have would
      // move every later rate one season out. Skip the row instead.
      if (row.data.prices.length !== columns.length) {
        onIssue?.({
          priceListId: record.externalId,
          externalYachtId,
          reason: "column_count_mismatch",
          detail: `${row.data.prices.length} prices for ${columns.length} columns`,
        });
        continue;
      }

      const entries = readRowPrices(row.data.prices, columns, currency);
      if (entries === null) {
        onIssue?.({
          priceListId: record.externalId,
          externalYachtId,
          reason: "malformed_price",
          detail: row.data.prices.join(","),
        });
        continue;
      }

      const existing = byYacht.get(externalYachtId);
      if (existing) {
        // One yacht sits in several lists: a list per season and per location set,
        // and in the recorded response the same 108 rows published twice under two
        // list ids. Appending keeps them all; the writer picks the entry whose
        // period covers the date, so an overwrite here would lose whole seasons.
        existing.push(...entries);
      } else {
        byYacht.set(externalYachtId, entries);
      }
    }
  }

  // Earliest and cheapest first, so the writer's "first period covering this date"
  // lookup is deterministic and lands on the lower rate when lists overlap.
  for (const prices of byYacht.values()) {
    prices.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.priceMinor - b.priceMinor,
    );
  }
  return byYacht;
}

export interface NausysSeasonalPriceLoaderOptions {
  db: Database;
  providerId: string;
  /**
   * Listing to vendor-yacht mapping. Shared with the Booking Manager loader rather
   * than hand-rolled here, so both get one chunked query instead of this file's own
   * unbounded `IN (...)` over however many listings a catalogue run touched.
   */
  resolver: Pick<CatalogueResolver, "toExternalYachtIds">;
  /** Where skipped rows go; without it a refused row is silent. */
  reporter?: Pick<SyncReporter, "reportError">;
}

/**
 * Seasonal prices for synthesized slots, read back out of the catalogue records the
 * nightly sync already retained. Read once per run: the price list is a full dump
 * that does not move between companies.
 */
export function createNausysSeasonalPriceLoader(
  options: NausysSeasonalPriceLoaderOptions,
): (listingIds: string[]) => Promise<Map<string, SeasonalPrice[]>> {
  const { db, providerId } = options;
  let pricesByYacht: Promise<Map<string, SeasonalPrice[]>> | null = null;

  return async (listingIds) => {
    const byListing = new Map<string, SeasonalPrice[]>();
    if (listingIds.length === 0) return byListing;

    pricesByYacht ??= db
      .select({ externalId: providerRecord.externalId, payload: providerRawPayload.payload })
      .from(providerRecord)
      .innerJoin(providerRawPayload, eq(providerRawPayload.id, providerRecord.rawPayloadId))
      .where(
        and(
          eq(providerRecord.providerId, providerId),
          eq(providerRecord.resourceType, "price_list"),
          eq(providerRecord.active, true),
        ),
      )
      .then(async (records) => {
        const issues: NausysPriceListIssue[] = [];
        const mapped = mapNausysPriceLists(records, (issue) => issues.push(issue));
        if (issues.length > 0) {
          await options.reporter?.reportError(
            new ContractError(`NauSYS priceLists: ${issues.length} rows skipped`, {
              endpoint: nausysEndpoints.catalogue.priceLists,
              payload: issues.slice(0, MAX_REPORTED_PRICE_ISSUES),
            }),
            { resourceType: "price_list" },
          );
        }
        return mapped;
      });

    const byYacht = await pricesByYacht;
    if (byYacht.size === 0) return byListing;

    // Now scoped to active records, which the hand-rolled query this replaced was
    // not: a yacht retired out of the vendor's dump is not repriced from a list that
    // no longer mentions it, and its listing is hidden by the orphan sweep anyway.
    const links = await options.resolver.toExternalYachtIds(listingIds);

    for (const [listingId, externalYachtId] of links) {
      const prices = byYacht.get(externalYachtId);
      if (prices && prices.length > 0) {
        byListing.set(listingId, prices);
      }
    }
    return byListing;
  };
}

interface PricePeriod {
  startDate: string;
  endDate: string;
}

/**
 * Dropping an unparseable period keeps the column, and therefore every later
 * column's position, intact: only the range it named is lost.
 */
function readColumnPeriods(
  periods: readonly { periodFrom: string; periodTo: string }[],
  priceListId: string,
  onIssue?: (issue: NausysPriceListIssue) => void,
): PricePeriod[] {
  const parsed: PricePeriod[] = [];

  for (const period of periods) {
    const range = `${period.periodFrom}-${period.periodTo}`;
    let startDate: string;
    let endDate: string;
    try {
      startDate = parseNausysDate(period.periodFrom);
      endDate = parseNausysDate(period.periodTo);
    } catch (error) {
      onIssue?.({
        priceListId,
        reason: "malformed_period",
        detail: error instanceof Error ? error.message : range,
      });
      continue;
    }

    if (endDate < startDate) {
      onIssue?.({
        priceListId,
        reason: "malformed_period",
        detail: `${range} ends before it starts`,
      });
      continue;
    }
    parsed.push({ startDate, endDate });
  }
  return parsed;
}

/** All of the row or none of it: a row with one bad amount is not half trustworthy. */
function readRowPrices(
  prices: readonly string[],
  columns: readonly PricePeriod[][],
  currency: string,
): SeasonalPrice[] | null {
  const entries: SeasonalPrice[] = [];

  for (const [index, price] of prices.entries()) {
    let priceMinor: number;
    try {
      priceMinor = decimalStringToMinor(price, currency);
    } catch {
      return null;
    }
    if (priceMinor < 0) return null;

    for (const period of columns[index] ?? []) {
      entries.push({ ...period, priceMinor, currency });
    }
  }
  return entries;
}
