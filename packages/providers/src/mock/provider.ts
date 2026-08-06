import {
  availabilityCalendarSchema,
  availabilitySearchSchema,
  availableOfferSchema,
  listingPeriodSchema,
  providerCapabilitiesSchema,
  providerQuoteSchema,
  quoteRequestSchema,
  type AvailabilityCalendar,
  type AvailabilitySearch,
  type AvailableOffer,
  type BookingDraft,
  type ListingPeriod,
  type ProviderCapabilities,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderReservation,
  type QuoteRequest,
  type RawEntity,
} from "../types";
import type { InventoryProvider } from "../provider";
import { availability } from "./data";
import { mapSlotToOffer, rawEntities, sourceHash } from "../mapping/mock";

const quoteTtlMs = 15 * 60 * 1000;

export class MockInventoryProvider implements InventoryProvider {
  readonly key = "mock" as const;

  async *syncCatalogue(_cursor?: string): AsyncIterable<RawEntity> {
    for (const entity of rawEntities()) {
      yield entity;
    }
  }

  async searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]> {
    const parsed = availabilitySearchSchema.parse(input);
    const offers = availability.slots
      .filter((slot) => slot.status === "available")
      .map((slot) => mapSlotToOffer(slot, parsed.guests ?? 2))
      .filter((offer) => {
        if (parsed.destination) {
          const destination = parsed.destination.toLowerCase();
          const matchesDestination =
            offer.listing.base.country.toLowerCase().includes(destination) ||
            offer.listing.base.region.toLowerCase().includes(destination) ||
            offer.listing.base.location.toLowerCase().includes(destination);
          if (!matchesDestination) {
            return false;
          }
        }
        if (parsed.category && offer.listing.category !== parsed.category) {
          return false;
        }
        if (parsed.checkIn && offer.checkIn !== parsed.checkIn) {
          return false;
        }
        if (parsed.checkOut && offer.checkOut !== parsed.checkOut) {
          return false;
        }
        if (parsed.minCabins && offer.listing.specs.cabins < parsed.minCabins) {
          return false;
        }
        if (parsed.maxPriceMinor && offer.clientPrice.amountMinor > parsed.maxPriceMinor) {
          return false;
        }
        return true;
      })
      .slice(0, parsed.limit);

    return availableOfferSchema.array().parse(offers);
  }

  async getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar> {
    const parsed = listingPeriodSchema.parse(input);
    const slots = availability.slots
      .filter((slot) => parsed.listingId.endsWith(slot.yachtId))
      .filter((slot) => slot.startDate >= parsed.from && slot.endDate <= parsed.to)
      .map((slot) => ({
        startDate: slot.startDate,
        endDate: slot.endDate,
        status: slot.status,
        price: {
          amountMinor: slot.priceMinor,
          currency: slot.currency,
        },
        minNights: slot.minNights,
        checkinWeekday: slot.checkinWeekday,
        checkoutWeekday: slot.checkoutWeekday,
      }));

    return availabilityCalendarSchema.parse({
      listingId: parsed.listingId,
      slots,
    });
  }

  async getQuote(input: QuoteRequest): Promise<ProviderQuote> {
    const parsed = quoteRequestSchema.parse(input);
    const slot = availability.slots.find(
      (item) =>
        parsed.listingId.endsWith(item.yachtId) &&
        item.startDate === parsed.checkIn &&
        item.endDate === parsed.checkOut,
    );

    if (!slot || slot.status !== "available") {
      throw new Error("Requested slot is not available");
    }

    const selectedExtras = availability.extras.filter(
      (item) => item.obligatory || parsed.extras.includes(item.code),
    );
    const extraTotalMinor = selectedExtras.reduce((total, item) => total + item.priceMinor, 0);
    const repriceDeltaMinor = parsed.extras.length > 0 ? 1500 : 0;
    const totalMinor = slot.priceMinor + extraTotalMinor + repriceDeltaMinor;
    const depositMinor = Math.round(totalMinor * 0.5);

    return providerQuoteSchema.parse({
      id: `qte_mock_${slot.yachtId}_${slot.startDate}`.replaceAll("-", "_"),
      provider: "mock",
      listingId: parsed.listingId,
      providerSourceId: `mock:${slot.yachtId}`,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      guests: parsed.guests,
      currency: parsed.currency,
      lines: [
        {
          code: "base-charter",
          label: "Charter price",
          amount: { amountMinor: slot.priceMinor, currency: parsed.currency },
        },
        ...selectedExtras.map((item) => ({
          code: item.code,
          label: item.name,
          amount: { amountMinor: item.priceMinor, currency: parsed.currency },
          payWhen: item.obligatory ? "at_check_in" : "now",
        })),
        ...(repriceDeltaMinor > 0
          ? [
              {
                code: "provider-reprice",
                label: "Provider reprice adjustment",
                amount: { amountMinor: repriceDeltaMinor, currency: parsed.currency },
              },
            ]
          : []),
      ],
      total: { amountMinor: totalMinor, currency: parsed.currency },
      deposit: { amountMinor: depositMinor, currency: parsed.currency },
      // Flat in the mock; real providers return this per yacht.
      securityDeposit: { amountMinor: 200_000, currency: parsed.currency },
      paymentPolicy: {
        mode: "deposit",
        depositPct: 0.5,
        balanceDueAt: parsed.checkIn,
      },
      priceSourceHash: sourceHash({ slot, extras: parsed.extras, repriceDeltaMinor }),
      expiresAt: new Date(Date.now() + quoteTtlMs).toISOString(),
      repriced: repriceDeltaMinor > 0,
    });
  }

  async createOption(input: BookingDraft): Promise<ProviderReservation> {
    return {
      id: `res_${input.quoteId}`,
      provider: "mock",
      listingId: input.listingId,
      quoteId: input.quoteId,
      status: "option_held",
      providerOptionId: `opt_${input.quoteId}`,
      holdExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };
  }

  async confirmBooking(input: BookingDraft): Promise<ProviderReservation> {
    return {
      id: `res_${input.quoteId}`,
      provider: "mock",
      listingId: input.listingId,
      quoteId: input.quoteId,
      status: "confirmed",
      providerReservationId: `mock-booking-${input.quoteId}`,
    };
  }

  async cancelOption(reservationId: string): Promise<ProviderReservation> {
    return {
      id: reservationId,
      provider: "mock",
      listingId: "unknown",
      quoteId: "unknown",
      status: "cancelled",
    };
  }

  async addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const listingId = input.reservationId.includes("lagoon")
      ? "ylst_yacht-lagoon-42-aurora"
      : "ylst_yacht-bavaria-c45-luna";
    return this.getQuote({
      listingId,
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 2,
      extras: input.extras,
      currency: "EUR",
    });
  }

  capabilities(): ProviderCapabilities {
    return providerCapabilitiesSchema.parse({
      supportsOptions: true,
      supportsWebhooks: false,
      optionExpiryOwnedByProvider: true,
      supportsExtrasMutation: true,
      supportsLiveQuote: true,
    });
  }
}
