import { availabilitySlot } from "@yacht-charter/db/schema/availability";
import { listing, listingCheckinRule } from "@yacht-charter/db/schema/listing";
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

export interface CheckinRule {
  /** JavaScript weekday, 0 Sunday to 6 Saturday, as `listing_checkin_rule` stores it. */
  checkinWeekday: number | null;
  checkoutWeekday: number | null;
  minNights: number | null;
}

export interface ListingRef {
  listingId: string;
  listingSourceId: string | null;
}

export interface ListingAvailabilityPlan {
  checkinRules: CheckinRule[];
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
  return (
    typeof (provider as Partial<AvailabilitySyncProvider>).createAvailabilitySource === "function"
  );
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

/* --------------------------------------------------------------- synthesis */

/**
 * What a listing gets when `listing_checkin_rule` is empty. Saturday to Saturday
 * for seven nights is the Adriatic bareboat norm and the only period the recorded
 * NauSYS `checkInPeriods` have ever shown, but it is still a guess: the count is
 * reported so a run that guesses for half the fleet is visible rather than silent.
 */
export const DEFAULT_CHECKIN_RULE: CheckinRule = {
  checkinWeekday: 6,
  checkoutWeekday: 6,
  minNights: 7,
};

const DAY_MS = 86_400_000;
const MAX_CHECKOUT_STRETCH_DAYS = 6;

export interface SynthesisInput {
  /** Only ranges whose occupancy we actually hold; see `runAvailabilitySync`. */
  windows: readonly DateWindow[];
  rules: readonly CheckinRule[];
  occupied: readonly { startDate: string; endDate: string }[];
  prices?: readonly SeasonalPrice[];
  /** Used when no seasonal price covers the period. */
  currency?: string | null;
}

export interface SynthesizedSlot {
  startDate: string;
  endDate: string;
  priceMinor: number | null;
  currency: string | null;
  minNights: number;
  checkinWeekday: number;
  checkoutWeekday: number;
}

export interface SynthesisResult {
  slots: SynthesizedSlot[];
  usedFallback: boolean;
}

/**
 * OUR INFERENCE, not the provider's word.
 *
 * Occupancy tells us what is taken; nothing tells us what is free. These slots are
 * derived by walking the listing's own check-in rule across the horizon and removing
 * anything the provider has already sold, which is why every one of them is written
 * with `availabilityConfirmed = false`. The read model surfaces that as
 * `has_unconfirmed_availability` so the card can say "subject to confirmation", and
 * nothing in this file may flip it true: only a live provider answer can.
 */
export function synthesizeAvailableSlots(input: SynthesisInput): SynthesisResult {
  const usable = input.rules.filter(
    (rule) => rule.checkinWeekday !== null || rule.minNights !== null,
  );
  const rules = usable.length > 0 ? usable : [DEFAULT_CHECKIN_RULE];
  const byPeriod = new Map<string, SynthesizedSlot>();

  for (const window of input.windows) {
    for (const rule of rules) {
      const checkinWeekday = rule.checkinWeekday ?? DEFAULT_CHECKIN_RULE.checkinWeekday ?? 6;
      let start = firstWeekdayOnOrAfter(window.start, checkinWeekday);

      while (start <= window.end) {
        const nights = durationOf(rule, start);
        const endDate = addDays(start, nights);
        // A candidate that leaves the window leaves the part of the calendar whose
        // occupancy we fetched, so we would be guessing against unknown bookings.
        if (endDate > window.end || overlapsAny(start, endDate, input.occupied)) {
          start = addDays(start, 7);
          continue;
        }

        const key = `${start}|${endDate}`;
        if (!byPeriod.has(key)) {
          // Seasonal prices come from WEEKLY price lists, so they only describe a
          // full week. NauSYS publishes daily rates separately and they are not a
          // seventh of the weekly one, so a shorter or longer period cannot be
          // derived from this number: pricing a 1-night slot at the week rate
          // advertises roughly seven times the real price. Leave those unpriced
          // until a live quote fills them in.
          const price = nights === WEEKLY_NIGHTS ? priceAt(start, input.prices) : null;
          byPeriod.set(key, {
            startDate: start,
            endDate,
            priceMinor: price?.priceMinor ?? null,
            currency: price?.currency ?? input.currency ?? null,
            minNights: nights,
            checkinWeekday,
            checkoutWeekday: weekdayOf(endDate),
          });
        }
        start = addDays(start, 7);
      }
    }
  }

  return {
    slots: [...byPeriod.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    usedFallback: usable.length === 0,
  };
}

function durationOf(rule: CheckinRule, start: string): number {
  const minNights = rule.minNights ?? DEFAULT_CHECKIN_RULE.minNights ?? 7;
  if (rule.checkoutWeekday === null) return minNights;

  // The rule names both ends, so the period runs to the first check-out day that
  // still satisfies the minimum rather than to the minimum itself.
  for (let nights = minNights; nights <= minNights + MAX_CHECKOUT_STRETCH_DAYS; nights += 1) {
    if (weekdayOf(addDays(start, nights)) === rule.checkoutWeekday) return nights;
  }
  return minNights;
}

/** Half-open: a charter ending the day the next begins is a turnaround, not a clash. */
function overlapsAny(
  start: string,
  end: string,
  intervals: readonly { startDate: string; endDate: string }[],
): boolean {
  return intervals.some((interval) => start < interval.endDate && interval.startDate < end);
}

const WEEKLY_NIGHTS = 7;

function priceAt(date: string, prices: readonly SeasonalPrice[] | undefined) {
  return prices?.find((price) => price.startDate <= date && date <= price.endDate) ?? null;
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

function weekdayOf(iso: string): number {
  return new Date(toUtcMs(iso)).getUTCDay();
}

function firstWeekdayOnOrAfter(iso: string, weekday: number): string {
  const shift = (weekday - weekdayOf(iso) + 7) % 7;
  return shift === 0 ? iso : addDays(iso, shift);
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
  synthesizedSlots: number;
  confirmedSlots: number;
  skippedYachts: number;
  /** Listings priced off the documented default because they carry no check-in rule. */
  fallbackListings: number;
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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown availability sync failure";
}

function contextOf(error: unknown, extra: Record<string, unknown> | undefined) {
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
  let synthesizedSlots = 0;
  let confirmedSlots = 0;
  let skippedYachts = 0;
  let fallbackListings = 0;
  let deletedSlots = 0;
  let sweptScopes = 0;
  let failedCount = 0;
  let budgetExhausted = false;
  let confirmationUnavailable = false;
  let aborted = false;

  const report = async (error: unknown, context: Record<string, unknown>) => {
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
        const synthesis = synthesizeAvailableSlots({
          windows,
          rules: plan?.checkinRules ?? [],
          occupied: occupiedByListing.get(ref.listingId) ?? [],
          prices: plan?.prices,
          currency: plan?.currency ?? null,
        });
        if (synthesis.usedFallback) fallbackListings += 1;
        if (synthesis.slots.length === 0) continue;

        await store.writeSlots(
          synthesis.slots.map((slot) => ({
            listingId: ref.listingId,
            listingSourceId: ref.listingSourceId,
            startDate: slot.startDate,
            endDate: slot.endDate,
            status: "available" as const,
            availabilityConfirmed: false,
            priceMinor: slot.priceMinor,
            currency: slot.currency,
            minNights: slot.minNights,
            checkinWeekday: slot.checkinWeekday,
            checkoutWeekday: slot.checkoutWeekday,
            sourceHash: `synth:${ref.listingId}:${slot.startDate}:${slot.endDate}:${slot.priceMinor ?? ""}`,
            seenAt: startedAt,
          })),
        );
        synthesizedSlots += synthesis.slots.length;
        touched.add(ref.listingId);
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
    // Slot writes are upserts, so "created" is every slot this run asserted and
    // "updated" is the hot pass upgrading one to a confirmed price.
    createdCount: occupiedSlots + synthesizedSlots,
    updatedCount: confirmedSlots,
    skippedCount: skippedYachts,
    failedCount,
    finishedAt: now(),
  });

  return {
    syncRunId: store.syncRunId,
    status,
    occupiedSlots,
    synthesizedSlots,
    confirmedSlots,
    skippedYachts,
    fallbackListings,
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

      const [rules, listings, prices] = await Promise.all([
        db
          .select({
            listingId: listingCheckinRule.listingId,
            checkinWeekday: listingCheckinRule.checkinWeekday,
            checkoutWeekday: listingCheckinRule.checkoutWeekday,
            minNights: listingCheckinRule.minNights,
          })
          .from(listingCheckinRule)
          .where(inArray(listingCheckinRule.listingId, listingIds)),
        db
          .select({ id: listing.id, currency: listing.defaultCurrency })
          .from(listing)
          .where(inArray(listing.id, listingIds)),
        options.loadSeasonalPrices?.(listingIds) ?? Promise.resolve(new Map<string, never[]>()),
      ]);

      const planFor = (listingId: string) => {
        const existing = plans.get(listingId);
        if (existing) return existing;
        const plan: ListingAvailabilityPlan = { checkinRules: [], prices: [], currency: null };
        plans.set(listingId, plan);
        return plan;
      };

      for (const row of rules) {
        planFor(row.listingId).checkinRules.push({
          checkinWeekday: row.checkinWeekday,
          checkoutWeekday: row.checkoutWeekday,
          minNights: row.minNights,
        });
      }
      for (const row of listings) {
        planFor(row.id).currency = row.currency;
      }
      for (const listingId of listingIds) {
        planFor(listingId).prices = prices.get(listingId) ?? [];
      }

      return plans;
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
export async function openAvailabilitySyncRun(db: Database, providerId: string): Promise<string> {
  const [row] = await db
    .insert(syncRun)
    .values({ providerId, kind: "availability", status: "pending" })
    .returning({ id: syncRun.id });

  if (!row) {
    throw new Error("sync_run insert returned no row");
  }
  return row.id;
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
      synthesizedSlots: 0,
      confirmedSlots: 0,
      skippedYachts: 0,
      fallbackListings: 0,
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
  const store = createDrizzleAvailabilitySyncStore({
    db,
    providerId,
    syncRunId,
    resolver,
    ...(provider.loadSeasonalPrices
      ? { loadSeasonalPrices: provider.loadSeasonalPrices.bind(provider) }
      : {}),
    ...(options.cursorScope ? { cursorScope: options.cursorScope } : {}),
  });

  return runAvailabilitySync({
    store,
    source: provider.createAvailabilitySource({ resume: options.resume }),
    ...(options.horizonMonths === undefined ? {} : { horizonMonths: options.horizonMonths }),
    ...(options.hotWindowBudgetMs === undefined
      ? {}
      : { hotWindowBudgetMs: options.hotWindowBudgetMs }),
    resume: options.resume,
    now,
  });
}
