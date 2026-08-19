import { availabilitySlot, listingFreePeriod } from "@yacht-charter/db/schema/availability";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord, syncError, syncRun } from "@yacht-charter/db/schema/provider";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { and, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { describeErrorChain } from "../shared/error-chain";

import type { InventoryProvider } from "../provider";
import type { Database } from "../registry";
import { AuthError, ContractError, ProviderError, toSyncErrorType } from "../shared/errors";
import { chunked, ROW_CHUNK } from "../shared/chunks";
import { clearSyncCursor, writeSyncCursor } from "./cursor";
import { openSyncRun } from "./run";
import type { SyncErrorContext } from "./runner";

/* ------------------------------------------------------------ canonical DTOs */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO yyyy-MM-dd date");

/**
 * A scope key meaning "every listing this provider has", for a vendor whose
 * occupancy dump is addressed by year alone.
 *
 * Booking Manager's `/availability/{year}` takes an optional company filter, so
 * one call answers for the whole credential. Fanning that out per company cost
 * ~1300 sequential calls an hour to re-fetch the same two dumps. The bound the
 * removal sweep needs is still there - it is the year - and `listListingsForScope`
 * reads this key as "the whole fleet" so the sweep stays complete rather than
 * being narrowed to the yachts that happen to appear in the dump.
 *
 * The cost is that occupancy failure isolation drops from per-company to per-year.
 * That was protecting against one company's dump being malformed while the rest
 * were fine, which is no longer a thing that can happen: there is one dump.
 */
export const ACCOUNT_WIDE_SCOPE = "*";

/**
 * One occupancy dump. NauSYS addresses it as (company, year); every provider that
 * publishes occupancy publishes it in some such bounded chunk, and the bound is
 * what makes the removal sweep safe. `ACCOUNT_WIDE_SCOPE` is the degenerate bound:
 * the year alone.
 */
export const availabilityScopeSchema = z.object({
  scopeKey: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});
export type AvailabilityScope = z.infer<typeof availabilityScopeSchema>;

/** A period the provider asserts is taken. The only thing occupancy actually says. */
export const occupiedIntervalSchema = z.object({
  externalYachtId: z.string().min(1),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: z.enum(["occupied", "option", "blocked"]),
  sourceHash: z.string().min(1),
});
export type OccupiedInterval = z.infer<typeof occupiedIntervalSchema>;

/** A period the provider priced and called free, in one specific call. */
export const confirmedOfferSchema = z.object({
  externalYachtId: z.string().min(1),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  sourceHash: z.string().min(1),
});
export type ConfirmedOffer = z.infer<typeof confirmedOfferSchema>;

export interface DateWindow {
  start: string;
  end: string;
}

export interface ListingRef {
  listingId: string;
  listingSourceId: string | null;
}

/* ------------------------------------------------------------------ source */

/**
 * What one scope's occupancy fetch returned, when the source needs to say more than
 * "here are the taken periods".
 *
 * A source may return a bare array instead; that means nothing was quarantined.
 */
export interface OccupancyDump {
  intervals: OccupiedInterval[];
  /**
   * Yachts whose dump could not be read in full.
   *
   * Their occupied periods are still written - asserting that time is taken can
   * never oversell - but they are excluded from free-period synthesis and from the
   * removal sweep, because we are holding an incomplete picture of their calendar.
   * Synthesizing against it would publish a gap the missing row was covering, and
   * sweeping against it would delete sold time the dump simply failed to restate.
   *
   * This exists because a scope grew. When one scope was one company-year, failing
   * the whole scope over a malformed row cost eleven boats and was obviously right.
   * Account-wide, the same rule lets one vendor row block every company - which is
   * exactly what it did: a single reversed date range out of 239,444.
   */
  quarantinedYachtIds?: readonly string[];
  /** One line per quarantine, for the error row. The source caps this. */
  issues?: readonly string[];
}

export type OccupancyFetchResult = OccupiedInterval[] | OccupancyDump;

export function normalizeOccupancyDump(result: OccupancyFetchResult): OccupancyDump {
  return Array.isArray(result) ? { intervals: result } : result;
}

export interface ConfirmedOfferPage {
  offers: ConfirmedOffer[];
  /** Where a resumed run should start; already past everything in this page. */
  cursor: unknown;
}

export interface AvailabilitySource {
  listScopes(): Promise<AvailabilityScope[]>;
  /**
   * Resolves only for a dump that arrived whole. A throw is what stops this scope
   * from being swept, so a partial answer must never be returned as a short list.
   */
  fetchOccupancy(scope: AvailabilityScope): Promise<OccupancyFetchResult>;
  /**
   * The accurate pass. Pages are yielded rather than collected so the caller can
   * abandon the walk on a wall-clock budget without having bought the rest of it.
   */
  searchConfirmed?(resume: unknown): AsyncIterable<ConfirmedOfferPage>;
  /**
   * Whether an error from `fetchOccupancy` will repeat on every remaining scope,
   * and so must stop the run rather than cost one scope.
   *
   * The source decides because only it knows its transport's error semantics.
   * NauSYS puts every endpoint behind one envelope schema, so a contract failure
   * really does predict the next call; Booking Manager gives each endpoint its own
   * array schema, and one company-year of malformed rows says nothing about the
   * rest - its catalogue source already draws exactly this distinction. Defaults
   * to the NauSYS reading, so a source that says nothing keeps today's behaviour.
   */
  isFatal?(error: unknown): boolean;
}

/**
 * A provider that can drive an availability sync; the mock cannot.
 *
 * Seasonal prices used to hang off this interface. They are catalogue data on a
 * catalogue cadence now - see `sync/price-writer.ts` for why.
 */
export interface AvailabilitySyncProvider {
  createAvailabilitySource(options: { resume?: unknown }): AvailabilitySource;
}

export function supportsAvailabilitySync(
  provider: InventoryProvider,
): provider is InventoryProvider & AvailabilitySyncProvider {
  return "createAvailabilitySource" in provider;
}

/* ------------------------------------------------------------------- store */

export interface AvailabilitySlotWrite {
  listingId: string;
  listingSourceId: string | null;
  startDate: string;
  endDate: string;
  status: "available" | "option" | "occupied" | "blocked";
  availabilityConfirmed: boolean;
  priceMinor: number | null;
  currency: string | null;
  minNights: number | null;
  checkinWeekday: number | null;
  checkoutWeekday: number | null;
  sourceHash: string;
  seenAt: Date;
}

export interface ConfirmSlotInput extends ListingRef {
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  sourceHash: string;
  seenAt: Date;
}

/**
 * One listing's free periods for the years a dump covered. Batched because an
 * account-wide scope hands the store the whole fleet in one pass, and a statement
 * per boat is a round-trip per boat.
 */
export interface FreePeriodWrite {
  ref: ListingRef;
  /** Empty is meaningful: it says this listing has nothing free left in those years. */
  periods: readonly FreePeriod[];
}

export interface AvailabilitySweepInput {
  listings: ListingRef[];
  year: number;
  /** Slots stamped before this instant were absent from a clean dump. */
  seenBefore: Date;
}

export interface AvailabilityCloseRunInput {
  status: "success" | "partial" | "failed";
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  finishedAt: Date;
}

export interface AvailabilitySyncStore {
  readonly syncRunId: string;
  startRun(startedAt: Date): Promise<void>;
  /** Null when the yacht has no listing link yet, which is normal after a first import. */
  resolveListing(externalYachtId: string): Promise<ListingRef | null>;
  /** Every listing under a provider-side scope, including the ones with no bookings. */
  listListingsForScope(scopeKey: string): Promise<ListingRef[]>;
  writeSlots(slots: AvailabilitySlotWrite[]): Promise<void>;
  /**
   * Replaces the free periods of every listing given, inside the years the dump
   * covered and nowhere else. A listing present with no periods loses the ones it
   * had; a listing absent from the batch is not touched at all.
   */
  writeFreePeriods(writes: readonly FreePeriodWrite[], years: readonly number[]): Promise<void>;
  /** False when the period is held by an occupied slot, which the vendor's own dump wins. */
  confirmSlot(input: ConfirmSlotInput): Promise<boolean>;
  sweepScope(input: AvailabilitySweepInput): Promise<number>;
  recordError(input: {
    errorType: ReturnType<typeof toSyncErrorType>;
    message: string;
    context: Record<string, unknown>;
  }): Promise<void>;
  saveCursor(cursor: unknown): Promise<void>;
  closeRun(input: AvailabilityCloseRunInput): Promise<void>;
  rebuildSearch(listingIds: string[]): Promise<void>;
}

/* ------------------------------------------------------------ free periods */

const DAY_MS = 86_400_000;

export interface FreePeriodInput {
  /** Only ranges whose occupancy we actually hold; see `runAvailabilitySync`. */
  windows: readonly DateWindow[];
  occupied: readonly { startDate: string; endDate: string }[];
}

export interface FreePeriod {
  startDate: string;
  endDate: string;
}

/**
 * The stretches with nothing sold in them: the complement of occupancy inside the windows
 * whose dumps arrived whole.
 *
 * This replaces a synthesis that asserted whole charters. That one walked the listing's
 * check-in rule and stepped a week at a time, so it published one reading of the rule as
 * though it were the offer: a listing selling any three nights from any day became
 * three-night blocks once a week, and every period in between was unreachable. Occupancy is
 * the only thing the provider actually states, so it is the only thing inverted here.
 * Whether a particular charter fits inside a free stretch is decided against the rules, at
 * the point someone asks for it.
 *
 * Half-open, so a charter ending the day the next begins leaves no gap between them.
 */
export function freePeriodsFrom(input: FreePeriodInput): FreePeriod[] {
  const periods: FreePeriod[] = [];

  for (const window of input.windows) {
    const inside = input.occupied
      .filter((interval) => interval.startDate < window.end && window.start < interval.endDate)
      .map((interval) => ({
        startDate: interval.startDate < window.start ? window.start : interval.startDate,
        endDate: interval.endDate > window.end ? window.end : interval.endDate,
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let cursor = window.start;
    for (const interval of inside) {
      if (interval.startDate > cursor) {
        periods.push({ startDate: cursor, endDate: interval.startDate });
      }
      // Overlapping bookings must not walk the cursor backwards and re-open sold time.
      if (interval.endDate > cursor) cursor = interval.endDate;
    }
    if (cursor < window.end) periods.push({ startDate: cursor, endDate: window.end });
  }

  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/* ------------------------------------------------------------- date helpers */

function toUtcMs(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(ms)) {
    throw new ContractError(`Malformed ISO date: ${JSON.stringify(iso)}`);
  }
  return ms;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(toUtcMs(iso) + days * DAY_MS);
}

export function addMonths(iso: string, months: number): string {
  const from = new Date(toUtcMs(iso));
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return toIso(target.getTime());
}

function clip(window: DateWindow, other: DateWindow): DateWindow | null {
  const start = window.start > other.start ? window.start : other.start;
  const end = window.end < other.end ? window.end : other.end;
  return start <= end ? { start, end } : null;
}

function yearWindow(year: number): DateWindow {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/* ---------------------------------------------------------------- the sync */

export const DEFAULT_HORIZON_MONTHS = 12;
/** Enough ids to eyeball against the catalogue, few enough to keep in a log line. */
const UNRESOLVED_SAMPLE_LIMIT = 10;
/** The hot pass shares the vendor's single lane, so it is bounded by time, not by completeness. */
export const DEFAULT_HOT_WINDOW_BUDGET_MS = 5 * 60 * 1000;

export interface AvailabilitySyncSummary {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  occupiedSlots: number;
  freePeriods: number;
  confirmedSlots: number;
  skippedYachts: number;
  /**
   * A few of the external yacht ids the dump named and the catalogue has no
   * listing for. `skippedYachts` alone cannot distinguish "a handful of boats we
   * never imported" from "the id spaces do not line up and nothing landed", which
   * is a whole run's difference and used to need a database session to tell apart.
   */
  unresolvedYachtIdSample: string[];
  /**
   * Yachts whose occupancy arrived unreadable, so their free periods were neither
   * asserted nor swept this run. Non-zero means a vendor data problem worth chasing,
   * not a code failure - the accompanying `sync_error` rows name the rows.
   */
  quarantinedYachts: number;
  deletedSlots: number;
  sweptScopes: number;
  failedCount: number;
  listingsTouched: number;
  budgetExhausted: boolean;
  /**
   * The provider refused the accurate pass outright. Distinct from a failure: the
   * occupancy pass used the same credential and worked, so this is a permission
   * scope rather than a broken run, and retrying on the next tick will not change
   * it. Slots stay unconfirmed until the provider grants the operation.
   */
  confirmationUnavailable: boolean;
  aborted: boolean;
}

export interface RunAvailabilitySyncOptions {
  store: AvailabilitySyncStore;
  source: AvailabilitySource;
  horizonMonths?: number;
  hotWindowBudgetMs?: number;
  resume?: unknown;
  now?: () => Date;
}

const thrownStringSchema = z.string();

function messageOf(error: unknown): string {
  if (error instanceof Error) return describeErrorChain(error);
  return thrownStringSchema.safeParse(error).data ?? "Unknown availability sync failure";
}

function contextOf(error: unknown, extra: SyncErrorContext | undefined) {
  const base = error instanceof ProviderError ? error.sanitizedContext() : {};
  return { ...base, ...extra };
}

/** Auth and contract failures repeat on every subsequent call; nothing else does. */
export function isFatalByDefault(error: unknown): boolean {
  const type = toSyncErrorType(error);
  return type === "auth" || type === "contract";
}

/** A credential failure repeats identically; a malformed payload need not. */
export function isFatalAuthOnly(error: unknown): boolean {
  return toSyncErrorType(error) === "auth";
}

export async function runAvailabilitySync(
  options: RunAvailabilitySyncOptions,
): Promise<AvailabilitySyncSummary> {
  const { store, source } = options;
  const now = options.now ?? (() => new Date());
  const horizonMonths = options.horizonMonths ?? DEFAULT_HORIZON_MONTHS;
  const budgetMs = options.hotWindowBudgetMs ?? DEFAULT_HOT_WINDOW_BUDGET_MS;

  const isFatal = source.isFatal ?? isFatalByDefault;

  const startedAt = now();
  await store.startRun(startedAt);

  const today = toIso(startedAt.getTime());
  const horizon: DateWindow = { start: today, end: addMonths(today, horizonMonths) };
  const touched = new Set<string>();

  let occupiedSlots = 0;
  let freePeriods = 0;
  let confirmedSlots = 0;
  let skippedYachts = 0;
  const unresolved = new Set<string>();
  const quarantined = new Set<string>();
  let deletedSlots = 0;
  let sweptScopes = 0;
  let failedCount = 0;
  let budgetExhausted = false;
  let confirmationUnavailable = false;
  let aborted = false;

  const report = async (error: unknown, context: SyncErrorContext) => {
    failedCount += 1;
    await store.recordError({
      errorType: toSyncErrorType(error),
      message: messageOf(error),
      context: contextOf(error, context),
    });
  };

  try {
    const scopes = await source.listScopes();
    const yearsByScope = new Map<string, number[]>();
    for (const scope of scopes) {
      const years = yearsByScope.get(scope.scopeKey) ?? [];
      years.push(scope.year);
      yearsByScope.set(scope.scopeKey, years);
    }

    for (const [scopeKey, years] of yearsByScope) {
      const cleanYears: number[] = [];
      const occupiedByListing = new Map<string, OccupiedInterval[]>();
      const listings = new Map<string, ListingRef>();

      // Listing ids we hold an incomplete calendar for, in this scope.
      const quarantinedListingIds = new Set<string>();

      for (const year of [...years].sort((a, b) => a - b)) {
        let intervals: OccupiedInterval[];
        try {
          const dump = normalizeOccupancyDump(await source.fetchOccupancy({ scopeKey, year }));
          intervals = dump.intervals;

          for (const externalYachtId of dump.quarantinedYachtIds ?? []) {
            quarantined.add(externalYachtId);
            const ref = await store.resolveListing(externalYachtId);
            if (ref) quarantinedListingIds.add(ref.listingId);
          }

          // Reported once per scope-year rather than per row: it downgrades the run to
          // `partial` so the vendor problem is visible, without turning one bad dump
          // into thousands of error rows.
          if (dump.issues?.length) {
            await report(new ContractError(dump.issues.join("; ")), {
              scopeKey,
              year,
              phase: "occupancy-quarantine",
              quarantinedYachts: dump.quarantinedYachtIds?.length ?? 0,
            });
          }
        } catch (error) {
          if (isFatal(error)) throw error;
          // No completion, so no sweep and no synthesis for this year: the rest of
          // the company's calendar is untouched rather than emptied.
          await report(error, { scopeKey, year });
          continue;
        }

        const writes: AvailabilitySlotWrite[] = [];
        for (const interval of intervals) {
          const ref = await store.resolveListing(interval.externalYachtId);
          if (!ref) {
            skippedYachts += 1;
            if (unresolved.size < UNRESOLVED_SAMPLE_LIMIT) unresolved.add(interval.externalYachtId);
            continue;
          }
          listings.set(ref.listingId, ref);
          touched.add(ref.listingId);
          const bucket = occupiedByListing.get(ref.listingId) ?? [];
          bucket.push(interval);
          occupiedByListing.set(ref.listingId, bucket);

          writes.push({
            listingId: ref.listingId,
            listingSourceId: ref.listingSourceId,
            startDate: interval.startDate,
            endDate: interval.endDate,
            status: interval.status,
            // The provider asserted this period is taken, so it is confirmed in the
            // only sense the column means: it is not our inference.
            availabilityConfirmed: true,
            priceMinor: null,
            currency: null,
            minNights: null,
            checkinWeekday: null,
            checkoutWeekday: null,
            sourceHash: interval.sourceHash,
            seenAt: startedAt,
          });
        }

        await store.writeSlots(writes);
        occupiedSlots += writes.length;
        cleanYears.push(year);
      }

      if (cleanYears.length === 0) continue;

      for (const ref of await store.listListingsForScope(scopeKey)) {
        listings.set(ref.listingId, ref);
      }

      const listingRefs = [...listings.values()];
      const windows = cleanYears
        .map((year) => clip(horizon, yearWindow(year)))
        .filter((window): window is DateWindow => window !== null);

      const freeWrites: FreePeriodWrite[] = [];

      for (const ref of listingRefs) {
        /*
         * A quarantined yacht is cleared, not skipped.
         *
         * Skipping it would leave the free periods the last good run published, and
         * those are the rows the catalogue advertises as bookable - so a week sold
         * since then would still be on sale, which is the exact thing quarantining is
         * meant to prevent. Writing an empty list deletes them inside the years we
         * fetched and asserts nothing in their place: the boat shows no availability
         * until the vendor's data is readable again. Its already-stored occupied slots
         * stay put, because the sweep below skips it too.
         */
        const free = quarantinedListingIds.has(ref.listingId)
          ? []
          : freePeriodsFrom({
              windows,
              occupied: occupiedByListing.get(ref.listingId) ?? [],
            });
        /*
         * Collected even when empty: a boat that just sold its last week must lose the
         * free periods it had, and the replace inside `writeFreePeriods` is what removes
         * them. Absent from the batch and present-but-empty are different statements.
         */
        freeWrites.push({ ref, periods: free });
        freePeriods += free.length;
        if (free.length > 0) touched.add(ref.listingId);
      }

      await store.writeFreePeriods(freeWrites, cleanYears);

      // Occupancy is a full dump per (company, year), so anything inside a year we
      // fetched cleanly and did not restamp is gone from the provider. Strictly one
      // year and one company at a time: a failed fetch swept nothing above.
      // Excluded from the sweep, so a slot we could not re-derive is not deleted into
      // looking free. Nothing advertises it either - its free periods were just cleared.
      const sweepable = listingRefs.filter((ref) => !quarantinedListingIds.has(ref.listingId));

      for (const year of cleanYears) {
        deletedSlots += await store.sweepScope({
          listings: sweepable,
          year,
          seenBefore: startedAt,
        });
        sweptScopes += 1;
      }
    }

    if (source.searchConfirmed) {
      const deadline = startedAt.getTime() + budgetMs;
      try {
        for await (const page of source.searchConfirmed(options.resume)) {
          for (const offer of page.offers) {
            const ref = await store.resolveListing(offer.externalYachtId);
            if (!ref) {
              skippedYachts += 1;
              if (unresolved.size < UNRESOLVED_SAMPLE_LIMIT) unresolved.add(offer.externalYachtId);
              continue;
            }
            const changed = await store.confirmSlot({
              ...ref,
              startDate: offer.startDate,
              endDate: offer.endDate,
              priceMinor: offer.priceMinor,
              currency: offer.currency,
              sourceHash: offer.sourceHash,
              seenAt: startedAt,
            });
            if (changed) {
              confirmedSlots += 1;
              touched.add(ref.listingId);
            }
          }

          await store.saveCursor(page.cursor);
          if (now().getTime() >= deadline) {
            budgetExhausted = true;
            break;
          }
        }
      } catch (error) {
        // The cheap pass already landed; losing the accurate one costs precision,
        // not the run. The cursor stays where it is so the next run resumes there.
        //
        // A refusal is not a failure. `AuthError` here means the credential is not
        // permitted to run the search, which the occupancy pass just disproved as a
        // credential problem, so it is a standing capability gap. Counting it would
        // mark every scheduled run `partial` and write an error row every hour,
        // burying the failures that do matter.
        if (error instanceof AuthError) {
          confirmationUnavailable = true;
        } else {
          await report(error, { phase: "hot-window" });
        }
        budgetExhausted = true;
      }

      if (!budgetExhausted) {
        await store.saveCursor(null);
      }
    }
  } catch (error) {
    aborted = true;
    await report(error, { aborted: true });
  }

  if (touched.size > 0) {
    try {
      await store.rebuildSearch([...touched]);
    } catch (error) {
      await report(error, { phase: "rebuild-search" });
    }
  }

  const status = aborted ? "failed" : failedCount > 0 ? "partial" : "success";
  await store.closeRun({
    status,
    // Writes are upserts, so "created" is everything this run asserted and "updated" is
    // the hot pass turning an inferred free stretch into a confirmed, priced offer.
    createdCount: occupiedSlots + freePeriods,
    updatedCount: confirmedSlots,
    skippedCount: skippedYachts,
    failedCount,
    finishedAt: now(),
  });

  return {
    syncRunId: store.syncRunId,
    status,
    occupiedSlots,
    freePeriods,
    confirmedSlots,
    skippedYachts,
    unresolvedYachtIdSample: [...unresolved],
    quarantinedYachts: quarantined.size,
    deletedSlots,
    sweptScopes,
    failedCount,
    listingsTouched: touched.size,
    budgetExhausted,
    confirmationUnavailable,
    aborted,
  };
}

/* ----------------------------------------------------------- drizzle store */

export const HOT_WINDOW_CURSOR_SCOPE = "occupancy:hot";

export interface DrizzleAvailabilityStoreOptions {
  db: Database;
  providerId: string;
  syncRunId: string;
  cursorScope?: string;
}

export function createDrizzleAvailabilitySyncStore(
  options: DrizzleAvailabilityStoreOptions,
): AvailabilitySyncStore {
  const { db, providerId, syncRunId } = options;
  const cursorKey = {
    providerId,
    kind: "availability" as const,
    scope: options.cursorScope ?? HOT_WINDOW_CURSOR_SCOPE,
  };
  /*
   * The whole provider's yacht -> listing index, read once.
   *
   * This was two queries per distinct yacht, which is fine for a vendor whose
   * dump covers one company and ruinous for one whose dump covers the account:
   * a Booking Manager run spent tens of thousands of sequential round-trips
   * establishing, one boat at a time, that it had no listings. The index is a few
   * columns over `listing_source` and no sync mutates it mid-run.
   */
  let indexPromise: Promise<Map<string, ListingRef>> | null = null;

  async function listingIndex(): Promise<Map<string, ListingRef>> {
    indexPromise ??= db
      .select({
        externalYachtId: listingSource.externalYachtId,
        listingId: listingSource.listingId,
        listingSourceId: listingSource.id,
        active: providerRecord.active,
      })
      .from(listingSource)
      .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
      .where(and(eq(providerRecord.providerId, providerId), isNotNull(listingSource.listingId)))
      .then((rows) => {
        const index = new Map<string, ListingRef>();
        // Active first, so a yacht carrying both a retired record and a live one
        // resolves to the live one. The two queries this replaced took whichever row
        // an unordered `limit(1)` happened to return.
        for (const row of [...rows].sort((a, b) => Number(b.active) - Number(a.active))) {
          if (!row.listingId || index.has(row.externalYachtId)) continue;
          index.set(row.externalYachtId, {
            listingId: row.listingId,
            // A retired yacht still resolves - its slots are still ours to restamp -
            // but contributes no source id, so the sweep will not scope by it. Kept
            // as the pair of queries this replaced behaved, not as a new rule.
            listingSourceId: row.active ? row.listingSourceId : null,
          });
        }
        return index;
      });

    return indexPromise;
  }

  return {
    syncRunId,

    async startRun(startedAt) {
      await db
        .update(syncRun)
        .set({ status: "running", startedAt })
        .where(eq(syncRun.id, syncRunId));
    },

    async resolveListing(externalYachtId) {
      return (await listingIndex()).get(externalYachtId) ?? null;
    },

    async listListingsForScope(scopeKey) {
      const rows = await db
        .select({ listingId: listingSource.listingId, listingSourceId: listingSource.id })
        .from(listingSource)
        .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
        .where(
          and(
            eq(providerRecord.providerId, providerId),
            eq(providerRecord.active, true),
            // The account-wide scope is not a company id and must not be matched as
            // one: it means the dump answered for the whole credential, so every
            // listing under it is in scope and the sweep covers the whole fleet.
            scopeKey === ACCOUNT_WIDE_SCOPE
              ? undefined
              : eq(listingSource.externalCompanyId, scopeKey),
            isNotNull(listingSource.listingId),
          ),
        );

      return rows.flatMap((row) =>
        row.listingId ? [{ listingId: row.listingId, listingSourceId: row.listingSourceId }] : [],
      );
    },

    async writeFreePeriods(writes, years) {
      if (writes.length === 0 || years.length === 0) return;

      /*
       * Replace within the years the dump covered, never outside them. A year whose fetch
       * failed keeps whatever it had: deleting there would erase availability on the
       * strength of a request that never completed.
       */
      const inAnyCleanYear = years.map((year) =>
        and(
          gte(listingFreePeriod.startDate, `${year}-01-01`),
          lte(listingFreePeriod.startDate, `${year}-12-31`),
        ),
      );

      // One DELETE per chunk of listings covering every clean year, rather than one
      // statement per listing per year. The whole fleet arrives in a single call under
      // an account-wide scope, so this is the difference between two round-trips and
      // tens of thousands.
      for (const chunk of chunked(writes)) {
        await db.delete(listingFreePeriod).where(
          and(
            inArray(
              listingFreePeriod.listingId,
              chunk.map((write) => write.ref.listingId),
            ),
            or(...inAnyCleanYear),
          ),
        );
      }

      const rows = writes.flatMap((write) =>
        write.periods.map((period) => ({
          listingId: write.ref.listingId,
          listingSourceId: write.ref.listingSourceId,
          startDate: period.startDate,
          endDate: period.endDate,
        })),
      );

      // Chunked by row, not by listing: how many periods a boat has is the provider's
      // business, and the bind-parameter ceiling is per statement.
      for (const chunk of chunked(rows, ROW_CHUNK)) {
        await db.insert(listingFreePeriod).values(chunk).onConflictDoNothing();
      }
    },

    async writeSlots(slots) {
      if (slots.length === 0) return;

      // Chunked for the same reason the other bulk writes are, and more urgently: a
      // slot binds thirteen parameters, so an account-wide dump in one statement
      // would blow the 65535 ceiling long before it ran out of rows.
      for (const chunk of chunked(slots, ROW_CHUNK)) {
        await db
          .insert(availabilitySlot)
          .values(
            chunk.map((slot) => ({
              listingId: slot.listingId,
              listingSourceId: slot.listingSourceId,
              startDate: slot.startDate,
              endDate: slot.endDate,
              status: slot.status,
              availabilityConfirmed: slot.availabilityConfirmed,
              priceMinor: slot.priceMinor,
              currency: slot.currency,
              minNights: slot.minNights,
              checkinWeekday: slot.checkinWeekday,
              checkoutWeekday: slot.checkoutWeekday,
              sourceHash: slot.sourceHash,
              updatedAt: slot.seenAt,
            })),
          )
          .onConflictDoUpdate({
            target: [
              availabilitySlot.listingId,
              availabilitySlot.startDate,
              availabilitySlot.endDate,
            ],
            set: {
              listingSourceId: sql`excluded.listing_source_id`,
              status: sql`excluded.status`,
              // A re-synthesized slot drops back to unconfirmed on purpose: a
              // confirmation the vendor gave yesterday is not one it gives today, and
              // re-asserting it would be us confirming our own guess.
              availabilityConfirmed: sql`excluded.availability_confirmed`,
              priceMinor: sql`excluded.price_minor`,
              currency: sql`excluded.currency`,
              minNights: sql`excluded.min_nights`,
              checkinWeekday: sql`excluded.checkin_weekday`,
              checkoutWeekday: sql`excluded.checkout_weekday`,
              sourceHash: sql`excluded.source_hash`,
              // The stamp the sweep reads; `$onUpdate` does not fire on a conflict path.
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
    },

    async confirmSlot(input) {
      const [existing] = await db
        .select({ id: availabilitySlot.id, status: availabilitySlot.status })
        .from(availabilitySlot)
        .where(
          and(
            eq(availabilitySlot.listingId, input.listingId),
            eq(availabilitySlot.startDate, input.startDate),
            eq(availabilitySlot.endDate, input.endDate),
          ),
        )
        .limit(1);

      if (existing && existing.status !== "available") return false;

      const values = {
        availabilityConfirmed: true,
        priceMinor: input.priceMinor,
        currency: input.currency,
        sourceHash: input.sourceHash,
        updatedAt: input.seenAt,
      };

      if (existing) {
        await db.update(availabilitySlot).set(values).where(eq(availabilitySlot.id, existing.id));
        return true;
      }

      // The vendor priced this exact period and called it free, so it is a
      // confirmed slot even though our synthesis never proposed it.
      await db.insert(availabilitySlot).values({
        listingId: input.listingId,
        listingSourceId: input.listingSourceId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "available",
        ...values,
      });
      return true;
    },

    async sweepScope(input) {
      if (input.listings.length === 0) return 0;

      let deleted = 0;
      // Chunked by listing, carrying each chunk's own source ids, so the pairing
      // the source scoping relies on only ever narrows.
      for (const chunk of chunked(input.listings)) {
        const sourceIds = chunk
          .map((ref) => ref.listingSourceId)
          .filter((id): id is string => id !== null);

        const rows = await db
          .delete(availabilitySlot)
          .where(
            and(
              inArray(
                availabilitySlot.listingId,
                chunk.map((ref) => ref.listingId),
              ),
              // Scoped by source as well as by listing so a second provider's slots on
              // a merged listing are not collateral damage.
              sourceIds.length > 0
                ? inArray(availabilitySlot.listingSourceId, sourceIds)
                : sql`false`,
              gte(availabilitySlot.startDate, `${input.year}-01-01`),
              lte(availabilitySlot.startDate, `${input.year}-12-31`),
              lt(availabilitySlot.updatedAt, input.seenBefore),
            ),
          )
          .returning({ id: availabilitySlot.id });

        deleted += rows.length;
      }

      return deleted;
    },

    async recordError(input) {
      await db.insert(syncError).values({
        syncRunId,
        errorType: input.errorType,
        message: input.message.slice(0, 2000),
        context: input.context,
      });
    },

    async saveCursor(cursor) {
      if (cursor === null || cursor === undefined) {
        await clearSyncCursor(db, cursorKey);
        return;
      }
      await writeSyncCursor(db, cursorKey, cursor);
    },

    async closeRun(input) {
      await db
        .update(syncRun)
        .set({
          status: input.status,
          createdCount: input.createdCount,
          updatedCount: input.updatedCount,
          skippedCount: input.skippedCount,
          failedCount: input.failedCount,
          finishedAt: input.finishedAt,
        })
        .where(eq(syncRun.id, syncRunId));
    },

    async rebuildSearch(listingIds) {
      await rebuildSearchReadModelsAfterSync(db, { listingIds });
    },
  };
}

/* ------------------------------------------------------------ entry points */

/** Created before the work starts so a caller can return the id and walk away. */
export function openAvailabilitySyncRun(db: Database, providerId: string): Promise<string> {
  return openSyncRun(db, providerId, "availability");
}

export interface AvailabilitySyncJobOptions {
  db: Database;
  provider: InventoryProvider;
  providerId: string;
  syncRunId: string;
  resume?: unknown;
  horizonMonths?: number;
  hotWindowBudgetMs?: number;
  cursorScope?: string;
  now?: () => Date;
}

export async function runAvailabilitySyncJob(
  options: AvailabilitySyncJobOptions,
): Promise<AvailabilitySyncSummary> {
  const { db, provider, providerId, syncRunId } = options;
  const now = options.now ?? (() => new Date());

  if (!supportsAvailabilitySync(provider)) {
    const finishedAt = now();
    await db
      .update(syncRun)
      .set({ status: "success", startedAt: finishedAt, finishedAt })
      .where(eq(syncRun.id, syncRunId));

    return {
      syncRunId,
      status: "success",
      occupiedSlots: 0,
      freePeriods: 0,
      confirmedSlots: 0,
      skippedYachts: 0,
      unresolvedYachtIdSample: [],
      quarantinedYachts: 0,
      deletedSlots: 0,
      sweptScopes: 0,
      failedCount: 0,
      listingsTouched: 0,
      budgetExhausted: false,
      confirmationUnavailable: false,
      aborted: false,
    };
  }

  const storeOptions: DrizzleAvailabilityStoreOptions = { db, providerId, syncRunId };
  if (options.cursorScope) storeOptions.cursorScope = options.cursorScope;

  const runOptions: RunAvailabilitySyncOptions = {
    store: createDrizzleAvailabilitySyncStore(storeOptions),
    source: provider.createAvailabilitySource({ resume: options.resume }),
    resume: options.resume,
    now,
  };
  if (options.horizonMonths !== undefined) runOptions.horizonMonths = options.horizonMonths;
  if (options.hotWindowBudgetMs !== undefined) {
    runOptions.hotWindowBudgetMs = options.hotWindowBudgetMs;
  }

  return runAvailabilitySync(runOptions);
}
