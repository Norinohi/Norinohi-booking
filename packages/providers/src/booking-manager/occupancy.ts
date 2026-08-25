import { ContractError } from "../shared/errors";
import { stableSourceHash } from "../shared/raw-retention";
import {
  ACCOUNT_WIDE_SCOPE,
  type AvailabilityScope,
  type AvailabilitySource,
  isFatalAuthOnly,
  type OccupancyDump,
  type OccupiedInterval,
} from "../sync/availability-writer";
import {
  confirmedOfferCursorSchema,
  streamBookingManagerConfirmedOffers,
} from "./confirmed-offers";
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
 * Scoping follows what the credential is actually asked for. With no allowlist the
 * vendor answers for the whole account in one call per year, so the scope is the
 * year alone (`ACCOUNT_WIDE_SCOPE`) - fanning it out per company meant ~1300
 * sequential calls an hour to re-fetch the same two dumps, and the vendor's own
 * integration guide never asks for that. An allowlist has already cut the fleet
 * down, so there it stays (company, year) and narrows the call server-side.
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
  // Named unavailable by the vendor on 2026-08-25. They would land on
  // UNKNOWN_STATUS anyway; listing them means a reader can tell a deliberate
  // block from an unrecognised one.
  [BM_RESERVATION_STATUS.OWNER_WEEK, "blocked"],
  [BM_RESERVATION_STATUS.REGATTA, "blocked"],
  [BM_RESERVATION_STATUS.SLEEP_ABOARD, "blocked"],
]);

/**
 * A status not named above, or a row with none, still arrived in a feed that only
 * lists taken periods, so it is unbookable. The vendor computes exactly this
 * judgement itself and does not share it over REST: the SOAP booking sheet carries
 * a `blocksavailability` (1/0) per term, described as the only field that matters
 * to an availability sync, and `/availability` carries no equivalent - its rows
 * are `id`, `dateFrom`, `dateTo`, `yachtId`, `status`, `baseFromId`, `baseToId`
 * and `optionExpirationDate`. So the map above exists to reconstruct a flag the
 * vendor already has, which is also why measurement beats their status legend. Deliberately NOT a throw: a new state
 * would otherwise stall availability for the whole account until we shipped a
 * patch, and `blocked` is the reading that cannot oversell.
 *
 * Q-BM-STATUS is answered. The vendor's full list arrived on 2026-08-25 and runs
 * to `11`, so this is now a guard against a future addition rather than against
 * the gaps we had.
 *
 * The vendor calls `5`, `7` and `8` bookable, which raised the worry that landing
 * them here hides sellable weeks. It does not: measured 2026-08-25 across the
 * unfiltered account, `/availability` emits only `1`, `2`, `3`, `4` and `11` -
 * 241,273 rows for 2026 and 17,671 for 2027, with no `5`, `7` or `8` in either.
 * The feed lists taken periods, and those three describe a free boat, so they are
 * simply never in it. Nothing is being over-blocked.
 *
 * If one ever does appear, do not unblock it on the vendor's word alone. `3` is
 * documented as available and measurably holds the boat: five status-3 periods
 * were each absent from `/offers` on 2026-08-20, with a control yacht offered for
 * an adjacent free week and refused for its status-3 one.
 */
const UNKNOWN_STATUS: OccupiedInterval["status"] = "blocked";

const DAY_MS = 86_400_000;

function addOneDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

export interface BookingManagerOccupancyScope {
  /** External company id, or `ACCOUNT_WIDE_SCOPE` for an unfiltered sweep. */
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
    /*
     * `companyId`, despite the spec. Both 2.1.4 and 2.2.1 document this parameter as
     * `company` on `/availability` and `/shortAvailability` (while `/yachts`,
     * `/prices` and `/offers` take `companyId`), so the documented name looks like
     * the right one. It is not: measured against the live v2 endpoint on 2026-08-19,
     * `?company=225` returns the unfiltered account dump - 16194 rows across 4017
     * yachts, byte-identical to sending no filter - while `?companyId=225` returns
     * the 1 row that company actually has. The vendor drops the unknown parameter
     * silently, so following the spec here reads as success and quietly widens every
     * scope to the whole account.
     *
     * Do not "correct" this to match the spec without re-running that comparison.
     * Q-BM-COMPANYPARAM is answered by measurement, and the spec is simply wrong:
     * re-verified 2026-08-20 across five endpoints, `companyId` filters on all of
     * them and `company` filters on none. `?company=225` on `/offers` returned
     * 3,150 rows spanning 2,487 distinct yachts, six of which belong to 225.
     */
    scope.companyId === ACCOUNT_WIDE_SCOPE ? undefined : { companyId: scope.companyId },
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
  // Q-BM-DATETO, and the evidence now leans our way: the SOAP manual
  // (availability_service_description v1.26, 1.4 getBookingSheet) documents the
  // same field on the same data as "dateto - date of the checkout", which is the
  // exclusive reading assumed here. Not a REST statement and not conclusive, so
  // the question stays open - if it were the inclusive last day, every interval
  // would be a night short.
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

/** Enough to name the problem to the vendor without pasting a dump into a log line. */
const MAX_REPORTED_ISSUES = 5;

/**
 * Lossy for one yacht, never for the scope.
 *
 * `mapBookingManagerAvailability` still throws on a row it cannot read - that is the
 * per-row contract and the only safe reading of a range that runs backwards. What
 * changed is who pays. Failing the whole scope was right when a scope was one
 * company-year; account-wide it means one row out of a quarter of a million blocks
 * every company, which is what a single reversed `dateFrom`/`dateTo` did on
 * 2026-08-19. So the yacht that owns the bad row is quarantined instead: its readable
 * periods are kept, and the writer neither publishes free time for it nor sweeps it.
 */
export function mapBookingManagerOccupancyDump(
  rows: readonly RestAvailability[],
  config: BookingManagerConfig,
): OccupancyDump {
  const intervals: OccupiedInterval[] = [];
  const quarantinedYachtIds = new Set<string>();
  const issues: string[] = [];

  for (const row of rows) {
    try {
      intervals.push(mapBookingManagerAvailability(row, config));
    } catch (error) {
      const externalYachtId = String(row.yachtId);
      quarantinedYachtIds.add(externalYachtId);
      if (issues.length < MAX_REPORTED_ISSUES) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  // A quarantined yacht's own readable rows are dropped too. Half a calendar is not
  // a calendar: keeping them would let the writer restamp some of its slots and
  // leave the rest to look stale, and the sweep it is excluded from is the only
  // thing that would have tidied that up.
  const kept =
    quarantinedYachtIds.size === 0
      ? intervals
      : intervals.filter((interval) => !quarantinedYachtIds.has(interval.externalYachtId));

  const dump: OccupancyDump = { intervals: kept };
  if (quarantinedYachtIds.size > 0) {
    dump.quarantinedYachtIds = [...quarantinedYachtIds];
    dump.issues = issues;
  }
  return dump;
}

export interface BookingManagerAvailabilitySourceOptions {
  client: BookingManagerClient;
  config: BookingManagerConfig;
  /** Calendar years to sweep; the writer sweeps a year at a time. */
  years: number[];
  /**
   * The allowlist, verbatim, when the deployment configured one. Present means the
   * fleet is already small, so each (company, year) is fetched with the vendor
   * narrowing it. Absent means one unfiltered dump per year under
   * `ACCOUNT_WIDE_SCOPE`, and the writer resolves the whole fleet against it.
   *
   * Deliberately not "every company we could enumerate". Passing the database's
   * company list here is what turned two calls into thirteen hundred.
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
 *
 * (The vendor's guide points at a cheaper answer than the one that reasoning
 * assumes: one `/offers` per Saturday-to-Saturday returns the whole available fleet
 * priced, which is a complete confirming pass in ~52 calls a year. Not built here.)
 */
export function createBookingManagerAvailabilitySource(
  options: BookingManagerAvailabilitySourceOptions,
): AvailabilitySource {
  const { client, config } = options;
  const scopeKeys =
    options.companyIds && options.companyIds.length > 0
      ? options.companyIds.map(String)
      : [ACCOUNT_WIDE_SCOPE];

  return {
    listScopes(): Promise<AvailabilityScope[]> {
      const scopes: AvailabilityScope[] = [];
      for (const scopeKey of scopeKeys) {
        for (const year of options.years) {
          scopes.push({ scopeKey, year });
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

    /*
     * The accurate pass, and for this vendor an authoritative one: `/offers` answers for the
     * whole scope a week at a time, so a yacht missing from a week's answer is a yacht the
     * vendor declined to sell it to. `fetchOccupancy` above cannot see that - it lists sales,
     * and a refused week has no sale in it.
     */
    searchConfirmed(resume) {
      // The writer hands back whatever the jsonb cursor column held; an unreadable one is a
      // sweep that starts over, which costs calls rather than correctness.
      const from = confirmedOfferCursorSchema.safeParse(resume).data ?? { weekIndex: 0 };
      return streamBookingManagerConfirmedOffers(
        {
          client,
          config,
          companyIds: scopeKeys.filter((key) => key !== ACCOUNT_WIDE_SCOPE),
          years: options.years,
        },
        from,
      );
    },

    /*
     * Only a credential failure repeats on every remaining scope. A malformed row
     * or a drifted array schema costs the scope-year it arrived in, exactly as this
     * provider's catalogue source already treats one, and for the same reason: each
     * endpoint here carries its own schema, so one saying nothing predicts nothing
     * about the next. Under the shared default a single bad row discarded a whole
     * run's completed work.
     */
    isFatal: isFatalAuthOnly,
  };
}
