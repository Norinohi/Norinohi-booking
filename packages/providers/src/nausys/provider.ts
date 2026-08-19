import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { createCatalogueResolver } from "../shared/catalogue-resolver";
import { createReservationEventRecorder } from "../shared/reservation-log";
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
import type { AvailabilitySource, AvailabilitySyncProvider } from "../sync/availability-writer";
import type { SeasonalPrice } from "../sync/price-writer";
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
import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { and, eq, isNotNull } from "drizzle-orm";

import { projectNausysCatalogue } from "./projection";
import { formatExtraCode } from "../shared/extra-code";
import { createNausysQuoteService, type CrewRoleService } from "./quote";
import { createNausysBookingService, createSecurityTokenSink } from "./booking";

import type { JsonField } from "../shared/json";

export interface NausysProviderOptions {
  db: Database;
  config?: NausysConfig;
  client?: NausysClient;
  /** Occupancy years to sweep. Defaults to the current and next calendar year. */
  years?: number[];
  hotWindows?: NausysHotWindow[];
  /** Currency the vendor is asked to price in; the quote echoes whatever it returns. */
  currency?: string;
  /** Injectable clock, so the default hot windows are testable. */
  now?: Date;
}

/**
 * How many upcoming charter weeks the accurate availability pass walks by default.
 * Each one is a paged `freeYachtsSearch` on the serialized sync lane, so this trades
 * confirmed prices against how long the run occupies it.
 */
const DEFAULT_HOT_WINDOW_COUNT = 8;

const SATURDAY = 6;
const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The next N Saturday-to-Saturday weeks.
 *
 * Saturday turnaround is the Adriatic bareboat norm and the only check-in day the
 * recorded NauSYS `checkInPeriods` use, so these windows line up with the periods
 * the synthesizer generates. A window that matched no synthesized slot would
 * confirm nothing.
 */
function upcomingCharterWeeks(from: Date, count: number): NausysHotWindow[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const untilSaturday = (SATURDAY - new Date(start).getUTCDay() + 7) % 7;
  const first = start + untilSaturday * DAY_MS;

  return Array.from({ length: count }, (_, index) => {
    const checkIn = new Date(first + index * 7 * DAY_MS);
    return {
      periodFrom: isoDay(checkIn),
      periodTo: isoDay(new Date(checkIn.getTime() + 7 * DAY_MS)),
    };
  });
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
  /**
   * The background sweeps, on the one lane the vendor's sequential-only rule still
   * governs. Splitting it off is what keeps a running catalogue sync from queueing
   * in front of a customer's checkout price check.
   */
  private readonly syncClient: NausysClient;
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
    this.syncClient = this.client.forLane("sync");
    this.resolver = createCatalogueResolver(this.db, "nausys");

    const now = options.now ?? new Date();
    const thisYear = now.getUTCFullYear();
    this.years = options.years ?? [thisYear, thisYear + 1];
    // Defaulted rather than left empty: an empty list silently skips the pass that
    // turns a synthesized guess into a vendor-confirmed price, so a scheduled run
    // would keep every slot unconfirmed and never say why.
    this.hotWindows = options.hotWindows ?? upcomingCharterWeeks(now, DEFAULT_HOT_WINDOW_COUNT);
    this.currency = options.currency ?? "EUR";

    this.quotes = createNausysQuoteService({
      client: this.client,
      resolver: this.resolver,
      config: this.config,
      loadCrewRoles: (listingId) => loadNausysCrewRoles(this.db, listingId),
      loadExtraLabels: (listingId) => loadNausysExtraLabels(this.db, listingId),
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
      recordEvent: createReservationEventRecorder(this.db, "nausys"),
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

  createCatalogueSyncSource(options: { resume?: JsonField }): CatalogueSyncSource {
    return nausysCatalogueSource(this.syncClient, {
      resume: parseResume(options.resume),
      companyScope: this.config.companyScope,
      listImportedCompanyIds: () => this.resolver.listYachtCompanyScopeKeys(),
    });
  }

  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
    return projectNausysCatalogue(records);
  }

  createAvailabilitySource(options: { resume?: JsonField }): AvailabilitySource {
    const build = async (): Promise<AvailabilitySource> =>
      createNausysAvailabilitySource({
        client: this.syncClient,
        // Which companies to sweep is a database read, and the factory is
        // synchronous, so it is deferred into listScopes rather than passed as an
        // empty list. Passing [] here would make every availability run a
        // successful no-op, which is the worst possible failure mode.
        //
        // Filtered through the scope rather than trusted: an out-of-scope company
        // keeps active records until the next catalogue run retires them, and
        // sweeping its availability in the meantime refreshes inventory we have
        // already decided not to sell.
        companyIds: (await this.resolver.listExternalCompanyIds()).filter((id) =>
          this.config.companyScope.inScope(id),
        ),
        years: this.years,
        hotWindows: this.hotWindows,
        currency: this.currency,
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
      searchConfirmed: async function* (resume) {
        const inner = await source();
        if (!inner.searchConfirmed) return;
        yield* inner.searchConfirmed(resume ?? options.resume);
      },
    };
  }

  async loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>> {
    const providerId = await this.resolver.providerId();
    return createNausysSeasonalPriceLoader({
      db: this.db,
      providerId,
      resolver: this.resolver,
    })(listingIds);
  }

  async searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]> {
    void input;
    // Search reads the local read model (listing_search_doc); no oRPC path calls
    // this. Live search would need a provider call plus a database hydration for
    // every card, which is a vendor round trip per result on every keystroke.
    throw new ContractError("NauSYS search reads the local read model, not the vendor", {
      providerCode: "nausys",
    });
  }

  async getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar> {
    void input;
    // The detail-page calendar reads availability_slot, which the availability
    // sync populates. A per-listing vendor call here would put a round trip in
    // front of every calendar render, for data the sweep already holds.
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
}

function parseResume(value: unknown): NausysCatalogueCursor | null {
  return parseNausysCatalogueCursor(value);
}

/**
 * The listing's crew roles, as the vendor services they are sold as.
 *
 * Reads back what the catalogue sync worked out: NauSYS marks no service as crew,
 * so `crew_role` is our reading of the service name and is null wherever the name
 * did not say. A listing whose operator names crew in a way the projection does not
 * recognise returns nothing here, and a crew choice on it stays unpriced rather
 * than being charged for a service we guessed at.
 */
/**
 * The listing's extras by canonical code, so a priced line can say what it is.
 * Both id spaces, because `freeYachts` prices out of both and the code carries
 * which one a row belongs to.
 */
async function loadNausysExtraLabels(
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
        eq(providerExtraCatalogue.source, "nausys"),
      ),
    );

  return new Map(rows.map((row) => [formatExtraCode(row.kind, row.externalId), row.name]));
}

async function loadNausysCrewRoles(db: Database, listingId: string): Promise<CrewRoleService[]> {
  const rows = await db
    .select({
      role: providerExtraCatalogue.crewRole,
      externalId: providerExtraCatalogue.externalId,
    })
    .from(providerExtraCatalogue)
    .where(
      and(
        eq(providerExtraCatalogue.listingId, listingId),
        eq(providerExtraCatalogue.source, "nausys"),
        eq(providerExtraCatalogue.kind, "service"),
        isNotNull(providerExtraCatalogue.crewRole),
      ),
    );

  return rows.flatMap((row) =>
    row.role === null ? [] : [{ role: row.role, externalId: row.externalId }],
  );
}
