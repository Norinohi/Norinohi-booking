import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { createCatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError } from "../shared/errors";
import type { Database } from "../registry";
import type { InventoryProvider } from "../provider";
import type {
  AvailabilityCalendar,
  AvailabilitySearch,
  AvailableOffer,
  BookingDraft,
  CanonicalCatalogue,
  ListingPeriod,
  ProviderCapabilities,
  ProviderExtrasMutation,
  ProviderKey,
  ProviderQuote,
  ProviderRecordSet,
  ProviderReservation,
  ProviderReservationRef,
  QuoteRequest,
  RawEntity,
} from "../types";
import type { CatalogueSyncSource } from "../sync/runner";
import type {
  AvailabilitySource,
  AvailabilitySyncProvider,
  SeasonalPrice,
} from "../sync/availability-writer";
import {
  type BookingManagerCatalogueCursor,
  bookingManagerCatalogueSource,
  parseBookingManagerCatalogueCursor,
} from "./catalogue";
import type { BookingManagerConfig } from "./config";
import { resolveBookingManagerConfig } from "./config";
import { BookingManagerClient } from "./client";
import { createBookingManagerAvailabilitySource } from "./occupancy";
import { createBookingManagerSeasonalPriceLoader } from "./prices";
import { projectBookingManagerCatalogue } from "./projection";
import { createBookingManagerQuoteService } from "./quote";
import { createBookingManagerBookingService } from "./booking";

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
    this.currency = options.currency ?? "EUR";

    this.quotes = createBookingManagerQuoteService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
    });

    this.seasonalPrices = createBookingManagerSeasonalPriceLoader({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      years: this.years,
      currency: this.currency,
    });

    this.bookings = createBookingManagerBookingService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      db: this.db,
      currency: this.currency,
      // The hold re-prices through the same live call the quote used, so a slot
      // that moved between quote and checkout is refused rather than held at a
      // price the vendor will not honour.
      verifyPrice: async (draft) => {
        const quote = await this.quotes.getBookingManagerQuote({
          listingId: draft.listingId,
          checkIn: draft.checkIn,
          checkOut: draft.checkOut,
          guests: draft.guests,
          extras: draft.extras,
          crewType: draft.crewType,
          currency: this.currency,
        });
        return quote.priceSourceHash;
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
    });
  }

  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
    return projectBookingManagerCatalogue(records);
  }

  createAvailabilitySource(options: { resume?: JsonField }): AvailabilitySource {
    void options;
    const build = async (): Promise<AvailabilitySource> =>
      createBookingManagerAvailabilitySource({
        client: this.client,
        config: this.config,
        // Which companies to sweep is a database read and the factory is
        // synchronous, so it is deferred into listScopes. Passing [] here would
        // make every availability run a successful no-op, which is the worst
        // possible failure mode.
        companyIds: (await this.resolver.listExternalCompanyIds())
          .map(Number)
          .filter(Number.isFinite),
        years: this.years,
      });

    let pending: Promise<AvailabilitySource> | null = null;
    const source = () => (pending ??= build());

    return {
      async listScopes() {
        return (await source()).listScopes();
      },
      async fetchOccupancy(scope) {
        return (await source()).fetchOccupancy(scope);
      },
    };
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

  capabilities(): ProviderCapabilities {
    return {
      supportsOptions: true,
      supportsWebhooks: false,
      optionExpiryOwnedByProvider: true,
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
}

function parseResume(value: unknown): BookingManagerCatalogueCursor | null {
  return parseBookingManagerCatalogueCursor(value);
}
