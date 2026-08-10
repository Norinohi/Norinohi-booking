import { provider } from "@yacht-charter/db/schema/provider";
import { eq } from "drizzle-orm";

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
  type NausysCatalogueCursor,
  nausysCatalogueSource,
  parseNausysCatalogueCursor,
} from "./catalogue";
import type { NausysConfig } from "./config";
import { resolveNausysConfig } from "./config";
import { NausysClient } from "./client";
import {
  createNausysAvailabilitySource,
  createNausysSeasonalPriceLoader,
  type NausysHotWindow,
} from "./occupancy";
import { projectNausysCatalogue } from "./projection";
import { createNausysQuoteService } from "./quote";
import {
  createNausysBookingService,
  createReservationEventRecorder,
  createSecurityTokenSink,
} from "./booking";

export interface NausysProviderOptions {
  db: Database;
  config?: NausysConfig;
  client?: NausysClient;
  /** Occupancy years to sweep. Defaults to the current and next calendar year. */
  years?: number[];
  hotWindows?: NausysHotWindow[];
  /** Currency the vendor is asked to price in; the quote echoes whatever it returns. */
  currency?: string;
}

/**
 * The NauSYS adapter, assembled from the per-concern modules rather than written
 * as one class: catalogue streaming, projection, pricing and the booking chain
 * have genuinely different testing needs, and only this file knows about all four.
 */
export class NausysInventoryProvider implements InventoryProvider, AvailabilitySyncProvider {
  readonly key: ProviderKey = "nausys";

  private readonly db: Database;
  private readonly config: NausysConfig;
  private readonly client: NausysClient;
  private readonly resolver: CatalogueResolver;
  private readonly years: number[];
  private readonly hotWindows: NausysHotWindow[];
  private readonly currency: string;
  private readonly quotes: ReturnType<typeof createNausysQuoteService>;
  private readonly bookings: ReturnType<typeof createNausysBookingService>;

  constructor(options: NausysProviderOptions) {
    this.db = options.db;
    this.config = options.config ?? resolveNausysConfig();
    this.client = options.client ?? new NausysClient({ config: this.config });
    this.resolver = createCatalogueResolver(this.db, "nausys");

    const thisYear = new Date().getUTCFullYear();
    this.years = options.years ?? [thisYear, thisYear + 1];
    this.hotWindows = options.hotWindows ?? [];
    this.currency = options.currency ?? "EUR";

    this.quotes = createNausysQuoteService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
    });

    this.bookings = createNausysBookingService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      db: this.db,
      // The hold re-prices through the same live call the quote used, so a slot
      // that moved between quote and checkout is refused rather than held at a
      // price the vendor will not honour.
      verifyPrice: async (draft) => {
        const quote = await this.quotes.getNausysQuote({
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
      recordEvent: createReservationEventRecorder(this.db),
      persistSecurityToken: createSecurityTokenSink(this.db),
    });
  }

  syncCatalogue(cursor?: string): AsyncIterable<RawEntity> {
    void cursor;
    // The interface predates scoped sync. Real runs go through
    // createCatalogueSyncSource, which carries the scope-completion events the
    // removal sweep depends on; this path would silently lose them.
    throw new ContractError(
      "NauSYS catalogue sync runs through createCatalogueSyncSource, not syncCatalogue",
      { providerCode: "nausys" },
    );
  }

  createCatalogueSyncSource(options: { resume?: unknown }): CatalogueSyncSource {
    return nausysCatalogueSource(this.client, {
      resume: parseResume(options.resume),
    });
  }

  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
    return projectNausysCatalogue(records);
  }

  createAvailabilitySource(options: { resume?: unknown }): AvailabilitySource {
    void options.resume;
    return createNausysAvailabilitySource({
      client: this.client,
      companyIds: [],
      years: this.years,
      hotWindows: this.hotWindows,
      currency: this.currency,
    });
  }

  /** Resolves the company list lazily; it is a database read, not a vendor call. */
  async createAvailabilitySourceForRun(options: { resume?: unknown }): Promise<AvailabilitySource> {
    void options.resume;
    return createNausysAvailabilitySource({
      client: this.client,
      companyIds: await this.resolver.listExternalCompanyIds(),
      years: this.years,
      hotWindows: this.hotWindows,
      currency: this.currency,
    });
  }

  async loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>> {
    const providerId = await this.resolveProviderId();
    return createNausysSeasonalPriceLoader({ db: this.db, providerId })(listingIds);
  }

  async searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]> {
    void input;
    // Search reads the local read model (listing_search_doc); no oRPC path calls
    // this. Live search would need a provider call plus a database hydration for
    // every card, on a lane that allows one request at a time.
    throw new ContractError("NauSYS search reads the local read model, not the vendor", {
      providerCode: "nausys",
    });
  }

  async getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar> {
    void input;
    // The detail-page calendar reads availability_slot, which the availability
    // sync populates. A per-listing vendor call here would serialize behind every
    // other request on the single lane.
    throw new ContractError("NauSYS availability is served from availability_slot", {
      providerCode: "nausys",
    });
  }

  getQuote(input: QuoteRequest): Promise<ProviderQuote> {
    return this.quotes.getNausysQuote(input);
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
      supportsExtrasMutation: true,
      supportsLiveQuote: true,
      minHoldMinutes: this.config.optionSafetyMarginMinutes,
    };
  }

  private providerIdPromise: Promise<string> | null = null;

  private resolveProviderId(): Promise<string> {
    this.providerIdPromise ??= this.db
      .select({ id: provider.id })
      .from(provider)
      .where(eq(provider.code, "nausys"))
      .limit(1)
      .then(([row]) => {
        if (!row) {
          throw new ContractError('No provider row registered for "nausys"', {
            providerCode: "nausys",
          });
        }
        return row.id;
      });

    return this.providerIdPromise;
  }
}

function parseResume(value: unknown): NausysCatalogueCursor | null {
  return parseNausysCatalogueCursor(value);
}
