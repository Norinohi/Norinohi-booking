import type {
  AvailabilityCalendar,
  AvailabilitySearch,
  AvailableOffer,
  BookingDraft,
  CanonicalCatalogue,
  CrewListReceipt,
  CrewListSubmission,
  CrewPlace,
  ListingPeriod,
  ProviderCapabilities,
  ProviderExtrasMutation,
  ProviderKey,
  ProviderQuote,
  ProviderRecordSet,
  ProviderReservation,
  ProviderReservationRef,
  CrewRequirements,
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
  capabilities(): ProviderCapabilities;
}
