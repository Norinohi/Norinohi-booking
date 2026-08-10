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
} from "./types";

export interface InventoryProvider {
  readonly key: ProviderKey;
  syncCatalogue(cursor?: string): AsyncIterable<RawEntity>;
  /**
   * Pure, no I/O. Projection is a second pass because a yacht cross-references
   * company, base and equipment records that arrive in earlier sync batches, so it
   * cannot be done while streaming.
   */
  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue;
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>;
  getQuote(input: QuoteRequest): Promise<ProviderQuote>;
  createOption(input: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(input: BookingDraft): Promise<ProviderReservation>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
  capabilities(): ProviderCapabilities;
}
