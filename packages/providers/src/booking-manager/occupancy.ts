import { ContractError } from "../shared/errors";
import { stableSourceHash } from "../shared/raw-retention";
import type {
  AvailabilityScope,
  AvailabilitySource,
  OccupiedInterval,
} from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { parseBookingManagerDate, parseBookingManagerDateTime } from "./dates";
import {
  BM_RESERVATION_STATUS,
  BM_RESERVATION_STATUS_NAMES,
  bookingManagerEndpoints,
  type RestAvailability,
  restAvailabilityListSchema,
} from "./endpoints";

/**
 * Booking Manager publishes occupancy two ways and only one of them is usable here.
 *
 * `/availability/{year}` returns a row per taken period with the vendor's own
 * reservation id, `status` and `optionExpirationDate`. `/shortAvailability/{year}`
 * compresses the same year into one character per day per yacht, which cannot say
 * whether a taken day is a sale, a lapsing option or a maintenance block, cannot
 * carry the expiry, and cannot separate two adjacent bookings from one long one.
 * The writer's canonical `OccupiedInterval` needs all three, so the main sweep uses
 * `/availability` and `/shortAvailability` is not called at all.
 *
 * Scoping is (companyId, year), matching the writer's per-scope sweep: a company
 * whose year failed to load leaves every other company's slots untouched.
 *
 * Raw retention happens in the transport (`BookingManagerClient`'s
 * `onRawResponse`), before anything here reads a field.
 */

/**
 * Every documented state occupies the boat. `SERVICE` is the vendor's maintenance
 * or delivery block, so it is `blocked` and never a sale; the NauSYS import had to
 * make exactly this distinction (0d9a822) after treating one as inventory sold.
 * `OPTION_IN_EXPIRATION` stays an option: it is still holding the week, and the
 * difference from `OPTION` is a countdown the slot row has nowhere to keep.
 */
const OCCUPANCY_STATUS = new Map<number, OccupiedInterval["status"]>([
  [BM_RESERVATION_STATUS.RESERVATION, "occupied"],
  [BM_RESERVATION_STATUS.OPTION, "option"],
  [BM_RESERVATION_STATUS.OPTION_IN_EXPIRATION, "option"],
  [BM_RESERVATION_STATUS.SERVICE, "blocked"],
]);

/**
 * A status outside the documented four, or a row with none, still arrived in a feed
 * that only lists taken periods, so it is unbookable. It is deliberately NOT a
 * throw: a fifth state added by the vendor would otherwise stall availability for
 * the whole account until we shipped a patch, and `blocked` is the reading that
 * cannot oversell. VENDOR QUESTION Q-BM-STATUS: is the enum closed at 4?
 */
const UNKNOWN_STATUS: OccupiedInterval["status"] = "blocked";

/** No `companyId` filter: one account-wide dump per year. */
const ALL_COMPANIES_SCOPE = "*";

const DAY_MS = 86_400_000;

function addOneDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

export interface BookingManagerOccupancyScope {
  /** External company id, or `*` for an unfiltered account-wide sweep. */
  companyId: string;
  year: number;
}

export async function fetchBookingManagerOccupancy(
  client: BookingManagerClient,
  scope: BookingManagerOccupancyScope,
): Promise<RestAvailability[]> {
  return client.get(
    bookingManagerEndpoints.availability(scope.year),
    restAvailabilityListSchema,
    scope.companyId === ALL_COMPANIES_SCOPE ? undefined : { companyId: scope.companyId },
  );
}

/**
 * Total or throwing, never lossy. A dropped row is a week we would then advertise
 * as free, so a malformed one fails the whole scope: the writer reads a throw as
 * "this company-year was never fetched" and neither synthesizes nor sweeps in it.
 */
export function mapBookingManagerAvailability(
  row: RestAvailability,
  config: BookingManagerConfig,
): OccupiedInterval {
  const startDate = parseBookingManagerDate(row.dateFrom);
  const rawEndDate = parseBookingManagerDate(row.dateTo);

  if (rawEndDate < startDate) {
    throw new ContractError(
      `Booking Manager availability row ${row.id ?? "(no id)"} ends ${rawEndDate} before it starts ${startDate}`,
      {
        endpoint: "availability",
        payload: { id: row.id, yachtId: row.yachtId, status: row.status },
      },
    );
  }

  // A same-day row is plausible for a SERVICE block (one day of maintenance) and
  // is not malformed, so it must not fail the scope. The writer's intervals are
  // half-open, where startDate === endDate would overlap nothing and quietly
  // advertise the day as free, so it is widened to the one day it describes.
  // VENDOR QUESTION Q-BM-DATETO: is `dateTo` the exclusive check-out day (assumed
  // here) or the inclusive last day? If inclusive, every interval is a night short.
  const endDate = rawEndDate === startDate ? addOneDay(startDate) : rawEndDate;

  const status = row.status ?? null;

  return {
    externalYachtId: String(row.yachtId),
    startDate,
    endDate,
    status: (status === null ? undefined : OCCUPANCY_STATUS.get(status)) ?? UNKNOWN_STATUS,
    // The expiry is parsed rather than passed through so a malformed one fails the
    // scope here, and it feeds the hash so a shifted deadline restamps the slot
    // even when the dates and status are unchanged.
    sourceHash: stableSourceHash({
      id: row.id,
      yachtId: row.yachtId,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      status,
      statusName: status === null ? null : (BM_RESERVATION_STATUS_NAMES.get(status) ?? null),
      baseFromId: row.baseFromId,
      baseToId: row.baseToId,
      optionExpiresAt:
        row.optionExpirationDate == null
          ? null
          : parseBookingManagerDateTime(row.optionExpirationDate, config.timeZone).toISOString(),
    }),
  };
}

export function mapBookingManagerOccupancyDump(
  rows: readonly RestAvailability[],
  config: BookingManagerConfig,
): OccupiedInterval[] {
  return rows.map((row) => mapBookingManagerAvailability(row, config));
}

export interface BookingManagerAvailabilitySourceOptions {
  client: BookingManagerClient;
  config: BookingManagerConfig;
  /** One `/availability` call per (company, year); the writer sweeps a year at a time. */
  years: number[];
  /**
   * External charter company ids. Omitted means one unfiltered dump per year, which
   * costs the per-company failure isolation and leaves the writer unable to list a
   * scope's listings, so only yachts that actually appear in the dump are swept.
   */
  companyIds?: number[];
}

/**
 * `searchConfirmed` is left unimplemented. The confirming pass exists to upgrade a
 * synthesized slot with a live price, and Booking Manager's `/offers` prices one
 * explicit `dateFrom`/`dateTo` at a time, so a useful walk needs the hot windows to
 * price. Nothing in these options carries them, and `createNausysAvailabilitySource`
 * makes the same call when its `hotWindows` list is empty. Slots stay
 * `availabilityConfirmed = false` until the quote path reconciles them live.
 */
export function createBookingManagerAvailabilitySource(
  options: BookingManagerAvailabilitySourceOptions,
): AvailabilitySource {
  const { client, config } = options;
  const companyIds =
    options.companyIds && options.companyIds.length > 0
      ? options.companyIds.map(String)
      : [ALL_COMPANIES_SCOPE];

  return {
    listScopes(): Promise<AvailabilityScope[]> {
      const scopes: AvailabilityScope[] = [];
      for (const companyId of companyIds) {
        for (const year of options.years) {
          scopes.push({ scopeKey: companyId, year });
        }
      }
      return Promise.resolve(scopes);
    },

    async fetchOccupancy(scope) {
      const rows = await fetchBookingManagerOccupancy(client, {
        companyId: scope.scopeKey,
        year: scope.year,
      });
      return mapBookingManagerOccupancyDump(rows, config);
    },
  };
}
