import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { and, eq } from "drizzle-orm";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { createCatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError } from "../shared/errors";
import { formatExtraCode } from "../shared/extra-code";
import type { Database } from "../registry";
import type { InventoryProvider } from "../provider";
import type {
  AvailabilityCalendar,
  AvailabilitySearch,
  AvailableOffer,
  BookingDraft,
  CanonicalCatalogue,
  CatalogueProjectionContext,
  ListingPeriod,
  ProviderCapabilities,
  ProviderExtrasMutation,
  ProviderKey,
  ProviderQuote,
  ProviderRecordSet,
  ProviderReservation,
  ProviderReservationRef,
  ProviderReservationState,
  QuoteRequest,
  RawEntity,
} from "../types";
import type { CatalogueSyncSource } from "../sync/runner";
import type { AvailabilitySource, AvailabilitySyncProvider } from "../sync/availability-writer";
import type { PriceWindow, SeasonalPrice } from "../sync/price-writer";
import {
  type BookingManagerCatalogueCursor,
  bookingManagerCatalogueSource,
  parseBookingManagerCatalogueCursor,
} from "./catalogue";
import type { BookingManagerConfig } from "./config";
import { reportColdStart } from "./warmup";
import { resolveBookingManagerConfig } from "./config";
import { BookingManagerClient } from "./client";
import { listAdvertisedCharterPeriods } from "@yacht-charter/db/search/read-model";
import { listShortCharterPeriods } from "@yacht-charter/db/search/repository";
import {
  ADVERTISED_PERIOD_LIMIT,
  SHORT_CHARTER_LENGTHS,
  SHORT_PERIODS_PER_LENGTH,
  type SweepPeriod,
  sweepRotation,
  withShortCharterPeriods,
} from "../shared/sweep-periods";
import { DEFAULT_RATE_LIMIT_PAUSE, priceWeeksSource } from "../shared/price-weeks";
import { createConcurrencyGovernor } from "../shared/concurrency-governor";
import { log } from "evlog";
import { streamBookingManagerConfirmedOffers } from "./confirmed-offers";
import { warmBookingManagerServers } from "./warmup";
import { createBookingManagerAvailabilitySource } from "./occupancy";
import { loadBookingManagerPriceTerms, loadBookingManagerProductName } from "./price-terms";
import { bookingManagerPriceWindow, createBookingManagerSeasonalPriceLoader } from "./prices";
import { projectBookingManagerCatalogue } from "./projection";
import { clientPriceOf, createBookingManagerQuoteService, repriceRequestFor } from "./quote";
import { createBookingManagerBookingService } from "./booking";
import { listChangedBookingManagerReservations } from "./reservations";
import { loadBookingManagerDiscountCap } from "./discount-cap";

import type { JsonField } from "../shared/json";

export interface BookingManagerProviderOptions {
  db: Database;
  config?: BookingManagerConfig;
  client?: BookingManagerClient;
  /** Occupancy years to sweep. Defaults to the current and next calendar year. */
  years?: number[];
  /** Currency the vendor is asked to price in; the quote echoes whatever it returns. */
  currency?: string;
  /** Injectable clock, so the default year window is testable. */
  now?: Date;
}

/**
 * The Booking Manager adapter, assembled from the per-concern modules rather than
 * written as one class, for the same reason the NauSYS one is: catalogue
 * streaming, projection, pricing and the booking chain have genuinely different
 * testing needs, and only this file knows about all four.
 */
export class BookingManagerInventoryProvider
  implements InventoryProvider, AvailabilitySyncProvider
{
  readonly key: ProviderKey = "booking_manager";

  private readonly db: Database;
  private readonly config: BookingManagerConfig;
  private readonly client: BookingManagerClient;
  private readonly resolver: CatalogueResolver;
  private readonly years: number[];
  /** Read once, so a long-lived process sweeps the same day it started from. */
  private readonly today: string;
  /** Which slice of the advertised tail this process sweeps; see `sweepRotation`. */
  private readonly rotation: number;
  private readonly currency: string;
  private readonly quotes: ReturnType<typeof createBookingManagerQuoteService>;
  private readonly bookings: ReturnType<typeof createBookingManagerBookingService>;
  private readonly seasonalPrices: ReturnType<typeof createBookingManagerSeasonalPriceLoader>;

  constructor(options: BookingManagerProviderOptions) {
    this.db = options.db;
    this.config = options.config ?? resolveBookingManagerConfig();
    this.client = options.client ?? new BookingManagerClient({ config: this.config });
    this.resolver = createCatalogueResolver(this.db, "booking_manager");

    const now = options.now ?? new Date();
    const thisYear = now.getUTCFullYear();
    this.years = options.years ?? [thisYear, thisYear + 1];
    this.today = now.toISOString().slice(0, 10);
    this.rotation = sweepRotation(now);
    this.currency = options.currency ?? "EUR";

    this.quotes = createBookingManagerQuoteService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      loadExtraLabels: (listingId) => loadBookingManagerExtraLabels(this.db, listingId),
      loadDiscountCapPercentage: (externalYachtId) =>
        loadBookingManagerDiscountCap(this.db, externalYachtId),
      loadProductName: (externalYachtId) => loadBookingManagerProductName(this.db, externalYachtId),
    });

    this.seasonalPrices = createBookingManagerSeasonalPriceLoader({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      years: this.years,
      currency: this.currency,
      loadPriceTerms: (externalYachtIds) => loadBookingManagerPriceTerms(this.db, externalYachtIds),
    });

    this.bookings = createBookingManagerBookingService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      db: this.db,
      currency: this.currency,
      loadProductName: (externalYachtId) => loadBookingManagerProductName(this.db, externalYachtId),
      // The hold re-prices through the same live call the quote used, so a slot
      // that moved between quote and checkout is refused rather than held at a
      // price the vendor will not honour.
      verifyPrice: async (draft) => {
        const quote = await this.quotes.getBookingManagerQuote(
          repriceRequestFor(draft, this.currency),
        );
        return { hash: quote.priceSourceHash, clientPrice: clientPriceOf(quote) };
      },
    });
  }

  syncCatalogue(cursor?: string): AsyncIterable<RawEntity> {
    void cursor;
    // The interface predates scoped sync. Real runs go through
    // createCatalogueSyncSource, which carries the scope-completion events the
    // removal sweep depends on; this path would silently lose them.
    throw new ContractError(
      "Booking Manager catalogue sync runs through createCatalogueSyncSource, not syncCatalogue",
      { providerCode: "booking_manager" },
    );
  }

  createCatalogueSyncSource(options: { resume?: JsonField }): CatalogueSyncSource {
    return bookingManagerCatalogueSource(this.client, {
      resume: parseResume(options.resume),
      companyScope: this.config.companyScope,
      listImportedCompanyIds: () => this.resolver.listYachtCompanyScopeKeys(),
      onWarmup: reportColdStart,
    });
  }

  projectCatalogue(
    records: ProviderRecordSet,
    context?: CatalogueProjectionContext,
  ): CanonicalCatalogue {
    return projectBookingManagerCatalogue(records, context);
  }

  createAvailabilitySource(options: { resume?: JsonField }): AvailabilitySource {
    void options;
    /*
     * Only the allowlist is passed through, and only to narrow the vendor call.
     *
     * This used to fall back to enumerating every company in `provider_record`,
     * which on a production credential is ~1300 of them: two years each, ~2600
     * sequential `/availability` calls, 20-50 minutes an hour, to reassemble two
     * dumps the vendor will hand over in two calls. Without an allowlist the sweep
     * is now account-wide and the writer resolves the whole fleet against it, so
     * an excluded company is no longer skipped at fetch time - its listings are
     * hidden by the catalogue retire instead, which is the mechanism that actually
     * owns that decision.
     */
    return createBookingManagerAvailabilitySource({
      client: this.client,
      config: this.config,
      companyIds: this.allowlistedCompanyIds(),
      years: this.years,
      /*
       * Read when the pass starts rather than now, for the reason NauSYS reads its own here:
       * the advertised periods move as charters are sold and the read model re-mints them.
       */
      loadAdvertisedPeriods: async () => {
        const [advertised, short] = await Promise.all([
          listAdvertisedCharterPeriods(this.db, {
            providerCode: this.key,
            limit: ADVERTISED_PERIOD_LIMIT,
          }),
          /* The charters a length filter shows, which no stored week covers; see NauSYS. */
          listShortCharterPeriods(this.db, {
            providerCode: this.key,
            lengths: SHORT_CHARTER_LENGTHS,
            perLength: SHORT_PERIODS_PER_LENGTH,
          }),
        ]);
        return withShortCharterPeriods(advertised, short);
      },
      today: this.today,
      rotation: this.rotation,
    });
  }

  /**
   * The `/offers` pass the availability sweep runs, over the given weeks for the whole scope.
   *
   * No currency, deliberately: the sweep asks without one, and the same week answered in two
   * currencies would flip the stored price and its hash every time the two passes alternate.
   */
  createPriceWeeksSource(weeks: readonly SweepPeriod[]): AvailabilitySource {
    /*
     * One governor for the whole pass, not one per stream. The source restarts the stream at the
     * week a rate limit stopped, so a governor built inside `stream` would hand the vendor back
     * the width that earned the 429 on every restart.
     */
    const concurrency = createConcurrencyGovernor({
      start: this.config.priceWeeksConcurrency,
      onBackOff: (limit) => log.warn({ action: "booking_manager.price_weeks_narrowed", limit }),
    });

    return priceWeeksSource({
      weeks,
      warmUp: async () => reportColdStart(await warmBookingManagerServers(this.client)),
      rateLimit: {
        ...DEFAULT_RATE_LIMIT_PAUSE,
        onPause: (pause, week) =>
          log.warn({
            action: "booking_manager.price_weeks_rate_limited",
            pause,
            week: week.startDate,
          }),
      },
      stream: (pending) =>
        streamBookingManagerConfirmedOffers(
          {
            client: this.client,
            config: this.config,
            companyIds: this.allowlistedCompanyIds().map(String),
            years: this.years,
            weeks: pending,
            today: this.today,
            concurrency,
          },
          { weekIndex: 0 },
        ),
    });
  }

  /** The allowlist, narrowed by the exclusions; empty means the whole account. */
  private allowlistedCompanyIds(): number[] {
    return this.config.companyScope.include
      .filter((id) => this.config.companyScope.inScope(id))
      .map(Number)
      .filter(Number.isFinite);
  }

  async searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]> {
    void input;
    // Search reads the local read model (listing_search_doc); no oRPC path calls
    // this. Live search would need a provider call plus a database hydration for
    // every card.
    throw new ContractError("Booking Manager search reads the local read model, not the vendor", {
      providerCode: "booking_manager",
    });
  }

  async getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar> {
    void input;
    // The detail-page calendar reads availability_slot, which the availability
    // sync populates.
    throw new ContractError("Booking Manager availability is served from availability_slot", {
      providerCode: "booking_manager",
    });
  }

  getQuote(input: QuoteRequest): Promise<ProviderQuote> {
    return this.quotes.getBookingManagerQuote(input);
  }

  createOption(input: BookingDraft): Promise<ProviderReservation> {
    return this.bookings.createOption(input);
  }

  confirmBooking(input: BookingDraft): Promise<ProviderReservation> {
    return this.bookings.confirmBooking(input);
  }

  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation> {
    return this.bookings.cancelOption(ref);
  }

  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    return this.bookings.addOrUpdateExtras(input);
  }

  /**
   * Read by id alone: the window is ignored, because neither vendor list is a delta (see
   * `reservations.ts`). `until` is still the clock an option's expiry is read against.
   */
  listChangedReservations(window: {
    since: Date;
    until: Date;
    reservationIds?: readonly string[] | undefined;
  }): Promise<ProviderReservationState[]> {
    return listChangedBookingManagerReservations(this.client, window, {
      timeZone: this.config.timeZone,
      now: window.until,
    });
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsOptions: true,
      supportsWebhooks: false,
      optionExpiryOwnedByProvider: true,
      lapsedOptionHoldsSlot: true,
      // The v2.1.4 spec exposes no reservation-extras mutation, so the booking
      // service refuses rather than pretending. Flipping this on needs a vendor
      // endpoint, not a code change here.
      supportsExtrasMutation: false,
      supportsLiveQuote: true,
      minHoldMinutes: this.config.optionSafetyMarginMinutes,
    };
  }

  /**
   * Booking Manager has no catalogue-wide price dump: `/prices` requires an
   * explicit date range, so unlike the NauSYS loader this reads live rather than
   * from stored `price_list` records.
   */
  loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>> {
    return this.seasonalPrices(listingIds);
  }

  /*
   * The sweep asks every charter week of `years` for the whole scope, and a sweep that fails
   * part way throws rather than answering short, so a week missing from a listing's rates is
   * one `/prices` no longer prices for it.
   */
  seasonalPricesCompleteWithin(): PriceWindow | undefined {
    return bookingManagerPriceWindow(this.years, this.today);
  }
}

function parseResume(value: JsonField): BookingManagerCatalogueCursor | null {
  return parseBookingManagerCatalogueCursor(value);
}

/** The listing's extras by canonical code, so a priced line can say what it is. */
async function loadBookingManagerExtraLabels(
  db: Database,
  listingId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .select({
      kind: providerExtraCatalogue.kind,
      externalId: providerExtraCatalogue.externalId,
      name: providerExtraCatalogue.name,
    })
    .from(providerExtraCatalogue)
    .where(
      and(
        eq(providerExtraCatalogue.listingId, listingId),
        eq(providerExtraCatalogue.source, "booking_manager"),
      ),
    );

  return new Map(rows.map((row) => [formatExtraCode(row.kind, row.externalId), row.name]));
}
