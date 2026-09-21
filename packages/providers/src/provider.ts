import type { JsonValue } from "./shared/json";
import type { SweepPeriod } from "./shared/sweep-periods";
import type { AvailabilitySource } from "./sync/availability-writer";
import type { SeasonalPrice } from "./sync/price-writer";
import type { CatalogueSyncSource } from "./sync/runner";
import type {
  AvailabilityCalendar,
  AvailabilitySearch,
  AvailableOffer,
  BookingDraft,
  CanonicalCatalogue,
  CatalogueProjectionContext,
  CrewListReceipt,
  CrewListSubmission,
  CrewPlace,
  ListingPeriod,
  Money,
  ProviderCapabilities,
  ProviderExtrasMutation,
  ProviderKey,
  ProviderQuote,
  ProviderRecordSet,
  ProviderReservation,
  ProviderReservationRef,
  ProviderReservationState,
  CrewRequirements,
  QuoteRequest,
  RawEntity,
  WaitingOptions,
} from "./types";

export interface InventoryProvider {
  readonly key: ProviderKey;
  syncCatalogue(cursor?: string): AsyncIterable<RawEntity>;
  /**
   * Pure, no I/O. Projection is a second pass because a yacht cross-references
   * company, base and equipment records that arrive in earlier sync batches, so it
   * cannot be done while streaming.
   */
  projectCatalogue(
    records: ProviderRecordSet,
    context?: CatalogueProjectionContext,
  ): CanonicalCatalogue;
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>;
  getQuote(input: QuoteRequest): Promise<ProviderQuote>;
  createOption(input: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(input: BookingDraft): Promise<ProviderReservation>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
  /**
   * What this operator requires on the crew list for one reservation of its own.
   *
   * Optional because it is a vendor courtesy rather than part of the booking chain: NauSYS
   * states it per reservation, Booking Manager does not, and a provider that says nothing
   * leaves the form asking for what it always asked for. Never used to submit passengers --
   * the crew list itself is completed on the operator's own page.
   */
  getCrewRequirements?(ref: ProviderReservationRef): Promise<CrewRequirements | null>;
  /**
   * Hands the operator the people aboard.
   *
   * Optional for the same reason as the requirements above: NauSYS takes a crew list over its
   * API, Booking Manager does not, and a provider that cannot receive one leaves the customer
   * with the operator's own page. Replaces the list wholesale, so re-sending a corrected one
   * is the ordinary case rather than a duplicate.
   */
  submitCrewList?(submission: CrewListSubmission): Promise<CrewListReceipt>;
  /**
   * The places this operator's crew list will accept, for the countries that insist on one.
   * NauSYS publishes Croatia's; a provider that publishes none leaves the field free text.
   */
  searchCrewPlaces?(query: string, limit: number): Promise<CrewPlace[]>;
  /**
   * The reservations this operator changed inside a window, so our copies can be checked
   * against theirs.
   *
   * Optional: NauSYS filters its reservation list by modify time, Booking Manager does not
   * publish such a feed, and a provider that cannot answer simply leaves its bookings
   * unreconciled rather than blocking the pass.
   */
  /**
   * The most we may take off this priced charter of our own accord, stated exactly, where the
   * vendor bounds it more tightly than the offer can say. Optional: only NauSYS does, from its
   * commission net of VAT. Asked only when our discounts take anything, since it costs a call.
   */
  exactClientDiscountCap?(quote: ProviderQuote): Promise<Money | undefined>;
  listChangedReservations?(window: {
    since: Date;
    until: Date;
    /** The reservations we hold open, for a provider that can be asked about them by id. */
    reservationIds?: readonly string[] | undefined;
  }): Promise<ProviderReservationState[]>;
  /**
   * How many people the operator already has queued for a week it has sold out of. Optional:
   * NauSYS keeps such a queue, Booking Manager does not publish one.
   */
  getWaitingOptions?(input: ListingPeriod): Promise<WaitingOptions>;
  /**
   * A catalogue stream that reports scope completion, which `syncCatalogue` cannot. Optional:
   * without it the runner adapts `syncCatalogue` and announces scopes only once it ends.
   */
  createCatalogueSyncSource?(options: { resume?: JsonValue }): CatalogueSyncSource;
  /** Drives an availability sync. Optional: the mock has no occupancy to sync. */
  createAvailabilitySource?(options: { resume?: JsonValue }): AvailabilitySource;
  /**
   * A confirming pass over exactly these weeks for the whole fleet, with no occupancy walk in
   * front of it; the nightly price-weeks job drives it. See `shared/price-weeks.ts`.
   */
  createPriceWeeksSource?(weeks: readonly SweepPeriod[]): AvailabilitySource;
  /**
   * The provider's published price list. Optional: a vendor may have no catalogue-wide price
   * dump at all, in which case the quote path is the only thing that prices its listings.
   */
  loadSeasonalPrices?(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>>;
  capabilities(): ProviderCapabilities;
}

/*
 * Guards for the optional sync capabilities above. Checked on the typed member rather than with
 * `in`, so renaming a capability is a compile error at every caller instead of a silent `false`.
 */
export type ScopedCatalogueProvider = Required<
  Pick<InventoryProvider, "createCatalogueSyncSource">
>;
export type AvailabilitySyncProvider = Required<
  Pick<InventoryProvider, "createAvailabilitySource">
>;
export type PriceWeeksProvider = Required<Pick<InventoryProvider, "createPriceWeeksSource">>;
export type SeasonalPriceProvider = Required<Pick<InventoryProvider, "loadSeasonalPrices">>;

export function supportsScopedCatalogueSync(
  provider: InventoryProvider,
): provider is InventoryProvider & ScopedCatalogueProvider {
  return provider.createCatalogueSyncSource !== undefined;
}

export function supportsAvailabilitySync(
  provider: InventoryProvider,
): provider is InventoryProvider & AvailabilitySyncProvider {
  return provider.createAvailabilitySource !== undefined;
}

export function supportsPriceWeeks(
  provider: InventoryProvider,
): provider is InventoryProvider & PriceWeeksProvider {
  return provider.createPriceWeeksSource !== undefined;
}

export function supportsSeasonalPrices<T extends Partial<SeasonalPriceProvider>>(
  provider: T,
): provider is T & SeasonalPriceProvider {
  return provider.loadSeasonalPrices !== undefined;
}
