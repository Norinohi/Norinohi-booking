import {
  availabilityCalendarSchema,
  availabilitySearchSchema,
  availableOfferSchema,
  bookingDraftSchema,
  listingPeriodSchema,
  providerCapabilitiesSchema,
  providerQuoteSchema,
  providerReservationRefSchema,
  providerReservationSchema,
  quoteRequestSchema,
  type AvailabilityCalendar,
  type AvailabilitySearch,
  type AvailableOffer,
  type BookingDraft,
  type CanonicalCatalogue,
  type CrewType,
  type ListingPeriod,
  type ProviderCapabilities,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderRecordSet,
  type ProviderReservation,
  type ProviderReservationRef,
  type QuoteRequest,
  type RawEntity,
} from "../types";
import type { InventoryProvider } from "../provider";
import { availability } from "./data";
import {
  mapSlotToOffer,
  projectMockCatalogue,
  rawEntities,
  resolveFixtureReference,
  sourceHash,
} from "../mapping/mock";
import { SlotUnavailableError } from "../shared/errors";

const quoteTtlMs = 15 * 60 * 1000;

const holdMinutes = 48 * 60;

/** The mock keeps no crew list, so extras are re-priced for a nominal party. */
const extrasMutationGuests = 2;

/**
 * Stands in for the rotating per-reservation token real providers issue: it has
 * to change at every step so a caller that fails to persist the latest one is
 * caught under PROVIDER_MODE=mock rather than in production.
 */
const securityTokenFor = (reservationId: string, step: string) =>
  sourceHash({ reservationId, step }).slice(0, 32);

/**
 * The crew a crew type puts on board, as fixture extra codes. Bareboat and an
 * unanswered control both mean no crew: a customer who has not chosen must not be
 * quoted a skipper they never asked for.
 */
function crewCodesFor(crewType: CrewType | undefined): Set<string> {
  if (!crewType || crewType === "bareboat") return new Set();

  const crew = availability.extras.filter((item) => item.crew);
  const included = crewType === "skipper" ? crew.filter((item) => item.code === "skipper") : crew;

  return new Set(included.map((item) => item.code));
}

export class MockInventoryProvider implements InventoryProvider {
  readonly key = "mock" as const;

  async *syncCatalogue(_cursor?: string): AsyncIterable<RawEntity> {
    for (const entity of rawEntities()) {
      yield entity;
    }
  }

  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
    return projectMockCatalogue(records);
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
      throw new SlotUnavailableError("Requested slot is not available");
    }

    const crewCodes = crewCodesFor(parsed.crewType);
    const selectedExtras = availability.extras.filter(
      (item) => item.obligatory || parsed.extras.includes(item.code) || crewCodes.has(item.code),
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
      crewType: parsed.crewType ?? null,
      currency: parsed.currency,
      lines: [
        {
          code: "base-charter",
          label: "Charter price",
          amount: { amountMinor: slot.priceMinor, currency: parsed.currency },
          kind: "base",
        },
        ...selectedExtras.map((item) => ({
          code: item.code,
          label: item.name,
          amount: { amountMinor: item.priceMinor, currency: parsed.currency },
          payWhen: item.obligatory ? "at_check_in" : "now",
          kind: item.obligatory ? "fee" : "extra",
          group: item.obligatory ? "mandatory" : item.crew ? "crew" : "optional",
        })),
        ...(repriceDeltaMinor > 0
          ? [
              {
                code: "provider-reprice",
                label: "Provider reprice adjustment",
                amount: { amountMinor: repriceDeltaMinor, currency: parsed.currency },
                kind: "adjustment",
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
      // crewType is part of the fingerprint: two crew choices price differently,
      // so a hash blind to it would let checkout commit the wrong one.
      priceSourceHash: sourceHash({
        slot,
        extras: parsed.extras,
        crewType: parsed.crewType ?? null,
        repriceDeltaMinor,
      }),
      expiresAt: new Date(Date.now() + quoteTtlMs).toISOString(),
      repriced: repriceDeltaMinor > 0,
    });
  }

  async createOption(input: BookingDraft): Promise<ProviderReservation> {
    const draft = bookingDraftSchema.parse(input);
    const reservationId = `res_${draft.quoteId}`;

    return providerReservationSchema.parse({
      id: reservationId,
      provider: "mock",
      listingId: draft.listingId,
      quoteId: draft.quoteId,
      status: "option_held",
      providerReservationId: reservationId,
      providerOptionId: `opt_${draft.quoteId}`,
      securityToken: securityTokenFor(reservationId, "option"),
      holdExpiresAt: new Date(Date.now() + holdMinutes * 60 * 1000).toISOString(),
    });
  }

  async confirmBooking(input: BookingDraft): Promise<ProviderReservation> {
    const draft = bookingDraftSchema.parse(input);
    const reservationId = draft.reservation?.providerReservationId ?? `res_${draft.quoteId}`;

    return providerReservationSchema.parse({
      id: reservationId,
      provider: "mock",
      listingId: draft.listingId,
      quoteId: draft.quoteId,
      status: "confirmed",
      providerReservationId: reservationId,
      providerOptionId: draft.reservation?.providerOptionId,
      securityToken: securityTokenFor(reservationId, "booking"),
    });
  }

  async cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation> {
    const parsed = providerReservationRefSchema.parse(ref);
    const located = resolveFixtureReference(parsed.providerReservationId);

    return providerReservationSchema.parse({
      id: parsed.providerReservationId,
      provider: "mock",
      listingId: located.listingId,
      quoteId: located.quoteId,
      status: "cancelled",
      providerReservationId: parsed.providerReservationId,
      securityToken: securityTokenFor(parsed.providerReservationId, "storno"),
    });
  }

  async addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const located = resolveFixtureReference(input.ref.providerReservationId);

    return this.getQuote({
      listingId: located.listingId,
      checkIn: located.checkIn,
      checkOut: located.checkOut,
      guests: extrasMutationGuests,
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
      minHoldMinutes: holdMinutes,
    });
  }
}
