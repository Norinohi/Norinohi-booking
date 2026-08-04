import type {
  AvailabilityCalendar,
  AvailabilitySearch,
  AvailableOffer,
  BookingDraft,
  ListingPeriod,
  ProviderCapabilities,
  ProviderExtrasMutation,
  ProviderKey,
  ProviderQuote,
  ProviderReservation,
  QuoteRequest,
  RawEntity,
} from "./types";

export interface InventoryProvider {
  readonly key: ProviderKey;
  syncCatalogue(cursor?: string): AsyncIterable<RawEntity>;
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>;
  getQuote(input: QuoteRequest): Promise<ProviderQuote>;
  createOption(input: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(input: BookingDraft): Promise<ProviderReservation>;
  cancelOption(reservationId: string): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
  capabilities(): ProviderCapabilities;
}
