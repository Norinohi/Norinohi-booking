import {
  availabilitySlot,
  listingFreePeriod,
  listingPricePeriod,
} from "@yacht-charter/db/schema/availability";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord, syncError, syncRun } from "@yacht-charter/db/schema/provider";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { InventoryProvider } from "../provider";
import type { Database } from "../registry";
import { createCatalogueResolver, type CatalogueResolver } from "../shared/catalogue-resolver";
import { AuthError, ContractError, ProviderError, toSyncErrorType } from "../shared/errors";
import { clearSyncCursor, writeSyncCursor } from "./cursor";
import { openSyncRun } from "./run";
import type { SyncErrorContext } from "./runner";

/* ------------------------------------------------------------ canonical DTOs */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO yyyy-MM-dd date");

/**
 * One occupancy dump. NauSYS addresses it as (company, year); every provider that
 * publishes occupancy publishes it in some such bounded chunk, and the bound is
 * what makes the removal sweep safe.
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

/** Catalogue price, valid for a date range rather than for one booking. */
export const seasonalPriceSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type SeasonalPrice = z.infer<typeof seasonalPriceSchema>;

export interface DateWindow {
  start: string;
  end: string;
}

export interface ListingRef {
  listingId: string;
  listingSourceId: string | null;
}

export interface ListingAvailabilityPlan {
  prices: SeasonalPrice[];
  currency: string | null;
}

/* ------------------------------------------------------------------ source */

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
  fetchOccupancy(scope: AvailabilityScope): Promise<OccupiedInterval[]>;
  /**
   * The accurate pass. Pages are yielded rather than collected so the caller can
   * abandon the walk on a wall-clock budget without having bought the rest of it.
   */
  searchConfirmed?(resume: unknown): AsyncIterable<ConfirmedOfferPage>;
}

/** A provider that can drive an availability sync; the mock cannot. */
export interface AvailabilitySyncProvider {
  createAvailabilitySource(options: { resume?: unknown }): AvailabilitySource;
  /** Seasonal prices per listing, so a synthesized slot can carry a price. */
  loadSeasonalPrices?(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>>;
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
  loadPlans(listingIds: string[]): Promise<Map<string, ListingAvailabilityPlan>>;
  writeSlots(slots: AvailabilitySlotWrite[]): Promise<void>;
  /** Replaces the listing's free periods inside the years the dump covered. */
  writeFreePeriods(ref: ListingRef, years: readonly number[], periods: FreePeriod[]): Promise<void>;
  /** The provider's published rates, stored as the periods it published them for. Returns the
   * number of distinct periods written, which is below the input whenever a yacht appears in
   * more than one price list. */
  writePricePeriods(ref: ListingRef, prices: readonly SeasonalPrice[]): Promise<number>;
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
/** The hot pass shares the vendor's single lane, so it is bounded by time, not by completeness. */
export const DEFAULT_HOT_WINDOW_BUDGET_MS = 5 * 60 * 1000;

export interface AvailabilitySyncSummary {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  occupiedSlots: number;
  freePeriods: number;
  confirmedSlots: number;
  skippedYachts: number;
  pricePeriods: number;
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
  if (error instanceof Error) return error.message;
  return thrownStringSchema.safeParse(error).data ?? "Unknown availability sync failure";
}

function contextOf(error: unknown, extra: SyncErrorContext | undefined) {
  const base = error instanceof ProviderError ? error.sanitizedContext() : {};
  return { ...base, ...extra };
}

/** Auth and contract failures repeat on every subsequent call; nothing else does. */
function isFatal(error: unknown): boolean {
  const type = toSyncErrorType(error);
  return type === "auth" || type === "contract";
}

export async function runAvailabilitySync(
  options: RunAvailabilitySyncOptions,
): Promise<AvailabilitySyncSummary> {
  const { store, source } = options;
  const now = options.now ?? (() => new Date());
  const horizonMonths = options.horizonMonths ?? DEFAULT_HORIZON_MONTHS;
  const budgetMs = options.hotWindowBudgetMs ?? DEFAULT_HOT_WINDOW_BUDGET_MS;

  const startedAt = now();
  await store.startRun(startedAt);

  const today = toIso(startedAt.getTime());
  const horizon: DateWindow = { start: today, end: addMonths(today, horizonMonths) };
  const touched = new Set<string>();

  let occupiedSlots = 0;
  let freePeriods = 0;
  let confirmedSlots = 0;
  let skippedYachts = 0;
  let pricePeriods = 0;
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

      for (const year of [...years].sort((a, b) => a - b)) {
        let intervals: OccupiedInterval[];
        try {
          intervals = await source.fetchOccupancy({ scopeKey, year });
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
      const plans = await store.loadPlans(listingRefs.map((ref) => ref.listingId));
      const windows = cleanYears
        .map((year) => clip(horizon, yearWindow(year)))
        .filter((window): window is DateWindow => window !== null);

      for (const ref of listingRefs) {
        const plan = plans.get(ref.listingId);

        /*
         * The provider's rates, kept as the periods it published. Written before the free
         * periods so a listing that turns out to be fully booked still carries its prices:
         * the card quotes "from" off these, not off what happens to be unsold today.
         */
        if (plan?.prices?.length) {
          pricePeriods += await store.writePricePeriods(ref, plan.prices);
          touched.add(ref.listingId);
        }

        const free = freePeriodsFrom({
          windows,
          occupied: occupiedByListing.get(ref.listingId) ?? [],
        });
        /*
         * Written even when empty: a boat that just sold its last week must lose the free
         * periods it had, and the sweep inside `writeFreePeriods` is what removes them.
         */
        await store.writeFreePeriods(ref, cleanYears, free);
        freePeriods += free.length;
        if (free.length > 0) touched.add(ref.listingId);
      }

      // Occupancy is a full dump per (company, year), so anything inside a year we
      // fetched cleanly and did not restamp is gone from the provider. Strictly one
      // year and one company at a time: a failed fetch swept nothing above.
      for (const year of cleanYears) {
        deletedSlots += await store.sweepScope({
          listings: listingRefs,
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
    pricePeriods,
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
  resolver: CatalogueResolver;
  loadSeasonalPrices?: (listingIds: string[]) => Promise<Map<string, SeasonalPrice[]>>;
  cursorScope?: string;
}

export function createDrizzleAvailabilitySyncStore(
  options: DrizzleAvailabilityStoreOptions,
): AvailabilitySyncStore {
  const { db, providerId, syncRunId, resolver } = options;
  const cursorKey = {
    providerId,
    kind: "availability" as const,
    scope: options.cursorScope ?? HOT_WINDOW_CURSOR_SCOPE,
  };
  // A company's fleet appears once per year of its dump and again in the hot pass;
  // resolving each yacht once per run keeps that to two queries per boat.
  const resolved = new Map<string, ListingRef | null>();

  return {
    syncRunId,

    async startRun(startedAt) {
      await db
        .update(syncRun)
        .set({ status: "running", startedAt })
        .where(eq(syncRun.id, syncRunId));
    },

    async resolveListing(externalYachtId) {
      const cached = resolved.get(externalYachtId);
      if (cached !== undefined) return cached;

      const listingId = await resolver.toListingId(externalYachtId);
      let ref: ListingRef | null = null;
      if (listingId) {
        const link = await resolver.toExternalListing(listingId).catch(() => null);
        ref = { listingId, listingSourceId: link?.listingSourceId ?? null };
      }
      resolved.set(externalYachtId, ref);
      return ref;
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
            eq(listingSource.externalCompanyId, scopeKey),
            isNotNull(listingSource.listingId),
          ),
        );

      return rows.flatMap((row) =>
        row.listingId ? [{ listingId: row.listingId, listingSourceId: row.listingSourceId }] : [],
      );
    },

    async loadPlans(listingIds) {
      const plans = new Map<string, ListingAvailabilityPlan>();
      if (listingIds.length === 0) return plans;

      const [listings, prices] = await Promise.all([
        db
          .select({ id: listing.id, currency: listing.defaultCurrency })
          .from(listing)
          .where(inArray(listing.id, listingIds)),
        options.loadSeasonalPrices?.(listingIds) ?? Promise.resolve(new Map<string, never[]>()),
      ]);

      const planFor = (listingId: string) => {
        const existing = plans.get(listingId);
        if (existing) return existing;
        const plan: ListingAvailabilityPlan = { prices: [], currency: null };
        plans.set(listingId, plan);
        return plan;
      };

      for (const row of listings) {
        planFor(row.id).currency = row.currency;
      }
      for (const listingId of listingIds) {
        planFor(listingId).prices = prices.get(listingId) ?? [];
      }

      return plans;
    },

    async writeFreePeriods(ref, years, periods) {
      /*
       * Replace within the years the dump covered, never outside them. A year whose fetch
       * failed keeps whatever it had: deleting there would erase availability on the
       * strength of a request that never completed.
       */
      for (const year of years) {
        await db
          .delete(listingFreePeriod)
          .where(
            and(
              eq(listingFreePeriod.listingId, ref.listingId),
              gte(listingFreePeriod.startDate, `${year}-01-01`),
              lte(listingFreePeriod.startDate, `${year}-12-31`),
            ),
          );
      }

      if (periods.length === 0) return;
      await db
        .insert(listingFreePeriod)
        .values(
          periods.map((period) => ({
            listingId: ref.listingId,
            listingSourceId: ref.listingSourceId,
            startDate: period.startDate,
            endDate: period.endDate,
          })),
        )
        .onConflictDoNothing();
    },

    async writePricePeriods(ref, prices) {
      /*
       * A yacht can appear in more than one price list, and the same period then arrives
       * twice. Postgres refuses an ON CONFLICT that would touch one row twice in a single
       * statement, so the batch is deduplicated on the conflict target before it is sent.
       */
      const unique = new Map<string, SeasonalPrice>();
      for (const price of prices) {
        unique.set(`${price.startDate}|${price.endDate}`, price);
      }
      if (unique.size === 0) return 0;

      await db
        .insert(listingPricePeriod)
        .values(
          [...unique.values()].map((price) => ({
            listingId: ref.listingId,
            listingSourceId: ref.listingSourceId,
            startDate: price.startDate,
            endDate: price.endDate,
            // The loader maps WEEKLY lists only; NauSYS publishes dailies separately and a
            // weekly rate is not a seventh of one, so they cannot be folded together here.
            kind: "weekly" as const,
            priceMinor: price.priceMinor,
            currency: price.currency,
          })),
        )
        .onConflictDoUpdate({
          target: [
            listingPricePeriod.listingId,
            listingPricePeriod.kind,
            listingPricePeriod.startDate,
            listingPricePeriod.endDate,
          ],
          set: {
            priceMinor: sql`excluded.price_minor`,
            currency: sql`excluded.currency`,
            updatedAt: sql`now()`,
          },
        });

      return unique.size;
    },

    async writeSlots(slots) {
      if (slots.length === 0) return;

      await db
        .insert(availabilitySlot)
        .values(
          slots.map((slot) => ({
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
      const listingIds = input.listings.map((ref) => ref.listingId);
      if (listingIds.length === 0) return 0;

      const sourceIds = input.listings
        .map((ref) => ref.listingSourceId)
        .filter((id): id is string => id !== null);

      const rows = await db
        .delete(availabilitySlot)
        .where(
          and(
            inArray(availabilitySlot.listingId, listingIds),
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

      return rows.length;
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
      pricePeriods: 0,
      deletedSlots: 0,
      sweptScopes: 0,
      failedCount: 0,
      listingsTouched: 0,
      budgetExhausted: false,
      confirmationUnavailable: false,
      aborted: false,
    };
  }

  const resolver = createCatalogueResolver(db, provider.key);
  const storeOptions: DrizzleAvailabilityStoreOptions = {
    db,
    providerId,
    syncRunId,
    resolver,
  };
  if (provider.loadSeasonalPrices) {
    storeOptions.loadSeasonalPrices = provider.loadSeasonalPrices.bind(provider);
  }
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
