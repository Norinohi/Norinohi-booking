import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../registry";
import { formatNausysDate, parseNausysDate } from "../shared/dates";
import { ContractError } from "../shared/errors";
import { decimalStringToMinor } from "../shared/money";
import { stableSourceHash } from "../shared/raw-retention";
import type {
  AvailabilityScope,
  AvailabilitySource,
  ConfirmedOffer,
  ConfirmedOfferPage,
  OccupiedInterval,
  SeasonalPrice,
} from "../sync/availability-writer";
import type { NausysClient } from "./client";
import {
  nausysEndpoints,
  type restFreeYachtSchema,
  restFreeYachtsSearchRequestSchema,
  restFreeYachtsSearchResponseSchema,
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
 * price, but it is priced per (destination, week) and shares the vendor's single
 * sequential lane, so it is only ever run over a bounded hot window.
 *
 * Raw retention happens in the transport (`NausysClient`'s `onRawResponse`), before
 * anything here parses a field.
 */

type RestOccupancyReservation = z.infer<typeof restOccupancyReservationSchema>;
type RestFreeYacht = z.infer<typeof restFreeYachtSchema>;

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
 * Total or throwing, never lossy. A dropped reservation is a week we would then
 * advertise as free, so a malformed record fails the whole scope: the writer treats
 * a throw as "this company-year was not fetched" and neither synthesizes nor sweeps
 * inside it.
 */
export function mapOccupancyReservation(reservation: RestOccupancyReservation): OccupiedInterval {
  const startDate = parseNausysDate(reservation.periodFrom);
  const endDate = parseNausysDate(reservation.periodTo);

  if (endDate <= startDate) {
    throw new ContractError(
      `NauSYS reservation ${reservation.id} ends ${endDate} on or before it starts ${startDate}`,
      { endpoint: "occupancy", payload: { id: reservation.id, yachtId: reservation.yachtId } },
    );
  }

  return {
    externalYachtId: String(reservation.yachtId),
    startDate,
    endDate,
    // An OPTION blocks the yacht for as long as it stands, so it is unbookable for
    // us; it is kept distinct from a RESERVATION because it can lapse.
    status: reservation.reservationType === "OPTION" ? "option" : "occupied",
    sourceHash: stableSourceHash(reservation),
  };
}

export function mapOccupancyDump(dump: NausysOccupancyDump): OccupiedInterval[] {
  return dump.reservations.map(mapOccupancyReservation);
}

/* ------------------------------------------------------- freeYachtsSearch */

export interface NausysSearchCriteria {
  /** ISO `yyyy-MM-dd`; converted to the vendor's `dd.MM.yyyy` on the wire. */
  periodFrom: string;
  periodTo: string;
  countries?: number[];
  regions?: number[];
  locations?: number[];
  charterCompanies?: number[];
  currency?: string;
  resultsPerPage?: number;
  /** 1-based, and the only resume handle the vendor offers. */
  startPage?: number;
  maxPages?: number;
}

export interface NausysSearchPage {
  page: number;
  totalPages: number;
  totalCount: number;
  offers: ConfirmedOffer[];
}

const DEFAULT_RESULTS_PER_PAGE = 50;
/** A vendor `totalPages` we cannot trust must not turn into an unbounded walk. */
const DEFAULT_MAX_PAGES = 200;

/**
 * Page-number pagination, walked strictly one page at a time.
 *
 * Yielding page by page rather than returning an array is the point: the caller
 * stops on a wall-clock budget, and a generator that is not pulled from issues no
 * further request. Buffering thousands of rows would spend the whole lane before
 * anyone could decide it was too expensive.
 */
export async function* fetchNausysFreeYachtsSearch(
  client: NausysClient,
  criteria: NausysSearchCriteria,
): AsyncGenerator<NausysSearchPage> {
  const resultsPerPage = criteria.resultsPerPage ?? DEFAULT_RESULTS_PER_PAGE;
  const maxPages = criteria.maxPages ?? DEFAULT_MAX_PAGES;
  const firstPage = criteria.startPage ?? 1;

  let page = firstPage;
  let totalPages = firstPage;

  while (page <= totalPages && page < firstPage + maxPages) {
    const request = restFreeYachtsSearchRequestSchema.omit({ credentials: true }).parse({
      periodFrom: formatNausysDate(criteria.periodFrom),
      periodTo: formatNausysDate(criteria.periodTo),
      ...(criteria.countries ? { countries: criteria.countries } : {}),
      ...(criteria.regions ? { regions: criteria.regions } : {}),
      ...(criteria.locations ? { locations: criteria.locations } : {}),
      ...(criteria.charterCompanies ? { charterCompanies: criteria.charterCompanies } : {}),
      ...(criteria.currency ? { currency: criteria.currency } : {}),
      resultsPerPage,
      resultsPage: page,
    });

    const response = await client.bookingCall(
      nausysEndpoints.availability.freeYachtsSearch,
      restFreeYachtsSearchResponseSchema,
      { ...request },
    );

    totalPages = response.totalPages ?? page;

    yield {
      page: response.currentPage ?? page,
      totalPages,
      totalCount: response.totalCount ?? 0,
      offers: (response.freeYachtsInPeriod ?? []).flatMap((yacht) => {
        const offer = mapFreeYachtToConfirmedOffer(yacht);
        return offer ? [offer] : [];
      }),
    };

    page += 1;
  }
}

/**
 * `clientPrice` is the only customer-facing number; `agencyPrice` is our cost and
 * never appears on `freeYachtsSearch` results anyway. UNDER_OPTION is dropped
 * rather than mapped: it is not free, and a confirmed slot must mean bookable.
 */
export function mapFreeYachtToConfirmedOffer(yacht: RestFreeYacht): ConfirmedOffer | null {
  if (yacht.status !== "FREE") return null;

  const currency = yacht.price.currency;
  return {
    externalYachtId: String(yacht.yachtId),
    startDate: parseNausysDate(yacht.periodFrom),
    endDate: parseNausysDate(yacht.periodTo),
    priceMinor: decimalStringToMinor(yacht.price.clientPrice, currency),
    currency,
    sourceHash: stableSourceHash({
      yachtId: yacht.yachtId,
      periodFrom: yacht.periodFrom,
      periodTo: yacht.periodTo,
      clientPrice: yacht.price.clientPrice,
      currency,
      status: yacht.status,
    }),
  };
}

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

  if (hotWindows.length === 0) return source;

  return {
    ...source,
    async *searchConfirmed(resume): AsyncIterable<ConfirmedOfferPage> {
      const from = parseNausysHotWindowCursor(resume) ?? { windowIndex: 0, page: 1 };

      for (const [windowIndex, window] of hotWindows.entries()) {
        if (windowIndex < from.windowIndex) continue;
        const startPage = windowIndex === from.windowIndex ? from.page : 1;

        for await (const page of fetchNausysFreeYachtsSearch(client, {
          periodFrom: window.periodFrom,
          periodTo: window.periodTo,
          ...(window.countries ? { countries: window.countries } : {}),
          ...(window.regions ? { regions: window.regions } : {}),
          ...(window.locations ? { locations: window.locations } : {}),
          ...(options.currency ? { currency: options.currency } : {}),
          ...(options.resultsPerPage ? { resultsPerPage: options.resultsPerPage } : {}),
          startPage,
        })) {
          const more = page.page < page.totalPages;
          yield {
            offers: page.offers,
            cursor: more
              ? { windowIndex, page: page.page + 1 }
              : { windowIndex: windowIndex + 1, page: 1 },
          };
        }
      }
    },
  };
}

/* -------------------------------------------------------------- price book */

/**
 * VENDOR QUESTION Q-PRICELIST. The `catalogue/v6/priceLists` payload has no
 * recorded response yet, and the PDF names the fields without fixing the nesting,
 * so both documented shapes are accepted: a price list carrying its own `prices[]`,
 * and a flat row that is already one priced period. A row we cannot read is dropped
 * rather than guessed at, which costs the card its "price from" and nothing else.
 */
const priceRowSchema = z.looseObject({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
});

const priceListSchema = z.looseObject({
  yachtId: z.union([z.number().int(), z.string()]).optional(),
  currency: z.string().optional(),
  prices: z.array(priceRowSchema).optional(),
});

const DEFAULT_PRICE_CURRENCY = "EUR";

export interface NausysPriceListRecord {
  externalId: string;
  payload: unknown;
}

/** Pure `price_list` records to seasonal prices, keyed by the vendor's yacht id. */
export function mapNausysPriceLists(
  records: readonly NausysPriceListRecord[],
): Map<string, SeasonalPrice[]> {
  const byYacht = new Map<string, SeasonalPrice[]>();

  for (const record of records) {
    const parsed = priceListSchema.safeParse(record.payload);
    if (!parsed.success || parsed.data.yachtId === undefined) continue;

    const yachtId = String(parsed.data.yachtId);
    const currency = parsed.data.currency;
    const rows = parsed.data.prices ?? [priceRowSchema.parse(parsed.data)];
    const prices = byYacht.get(yachtId) ?? [];

    for (const row of rows) {
      const price = toSeasonalPrice(row, currency);
      if (price) prices.push(price);
    }
    byYacht.set(yachtId, prices);
  }

  // Earliest first, so the writer's "first period covering this date" lookup is
  // deterministic when the vendor sends overlapping ranges.
  for (const prices of byYacht.values()) {
    prices.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  return byYacht;
}

export interface NausysSeasonalPriceLoaderOptions {
  db: Database;
  providerId: string;
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
      .then(mapNausysPriceLists);

    const byYacht = await pricesByYacht;
    if (byYacht.size === 0) return byListing;

    const links = await db
      .select({
        listingId: listingSource.listingId,
        externalYachtId: listingSource.externalYachtId,
      })
      .from(listingSource)
      .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
      .where(
        and(
          eq(providerRecord.providerId, providerId),
          inArray(listingSource.listingId, listingIds),
          isNotNull(listingSource.listingId),
        ),
      );

    for (const link of links) {
      const prices = byYacht.get(link.externalYachtId);
      if (link.listingId && prices && prices.length > 0) {
        byListing.set(link.listingId, prices);
      }
    }
    return byListing;
  };
}

function toSeasonalPrice(
  row: z.infer<typeof priceRowSchema>,
  fallbackCurrency: string | undefined,
): SeasonalPrice | null {
  const from = row.dateFrom ?? row.periodFrom;
  const to = row.dateTo ?? row.periodTo;
  const amount = row.price ?? row.amount;
  if (!from || !to || amount === undefined) return null;

  const currency = (row.currency ?? fallbackCurrency ?? DEFAULT_PRICE_CURRENCY).toUpperCase();
  if (currency.length !== 3) return null;

  try {
    return {
      startDate: parseNausysDate(from),
      endDate: parseNausysDate(to),
      priceMinor: decimalStringToMinor(String(amount), currency),
      currency,
    };
  } catch {
    return null;
  }
}
