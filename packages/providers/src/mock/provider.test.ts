import { describe, expect, it } from "vitest";

import { SlotUnavailableError } from "../shared/errors";
import type { BookingDraft } from "../types";
import { MockInventoryProvider } from "./provider";

const draft: BookingDraft = {
  listingId: "ylst_yacht-lagoon-42-aurora",
  quoteId: "qte_mock_yacht_lagoon_42_aurora_2026_08_08",
  checkIn: "2026-08-08",
  checkOut: "2026-08-15",
  guests: 8,
  extras: ["skipper"],
  priceSourceHash: "hash",
  customer: { name: "Ada", email: "ada@example.com" },
};

describe("MockInventoryProvider", () => {
  it("returns a repriced quote when optional extras are selected", async () => {
    const provider = new MockInventoryProvider();
    const quote = await provider.getQuote({
      listingId: "ylst_yacht-lagoon-42-aurora",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 8,
      extras: ["skipper"],
      currency: "EUR",
    });

    expect(quote.repriced).toBe(true);
    expect(quote.total.amountMinor).toBe(706500);
    expect(quote.deposit.amountMinor).toBe(353250);
  });

  it("fails a busy period with a typed error rather than a message", async () => {
    const provider = new MockInventoryProvider();

    await expect(
      provider.getQuote({
        listingId: "ylst_yacht-lagoon-52f-solenne",
        checkIn: "2026-08-08",
        checkOut: "2026-08-15",
        guests: 4,
        extras: [],
        currency: "EUR",
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("holds an option with a reservation handle and a security token", async () => {
    const provider = new MockInventoryProvider();
    const reservation = await provider.createOption(draft);

    expect(reservation.providerReservationId).toBe(`res_${draft.quoteId}`);
    expect(reservation.providerOptionId).toBe(`opt_${draft.quoteId}`);
    expect(reservation.securityToken).toEqual(expect.any(String));
    expect(reservation.holdExpiresAt).toEqual(expect.any(String));
  });

  it("rotates the security token on every reservation change", async () => {
    const provider = new MockInventoryProvider();
    const option = await provider.createOption(draft);
    const confirmed = await provider.confirmBooking({
      ...draft,
      reservation: {
        providerReservationId: option.providerReservationId as string,
        providerOptionId: option.providerOptionId,
        securityToken: option.securityToken,
      },
    });
    const cancelled = await provider.cancelOption({
      providerReservationId: option.providerReservationId as string,
      securityToken: option.securityToken,
    });

    expect(confirmed.providerReservationId).toBe(option.providerReservationId);
    expect(confirmed.securityToken).not.toBe(option.securityToken);
    expect(cancelled.securityToken).not.toBe(option.securityToken);
    expect(cancelled.securityToken).not.toBe(confirmed.securityToken);
  });

  it("derives the cancelled listing from the reference instead of guessing", async () => {
    const provider = new MockInventoryProvider();
    const cancelled = await provider.cancelOption({
      providerReservationId: "res_qte_mock_yacht_bavaria_c45_luna_2026_08_08",
    });

    expect(cancelled.listingId).toBe("ylst_yacht-bavaria-c45-luna");
    expect(cancelled.quoteId).toBe("qte_mock_yacht_bavaria_c45_luna_2026_08_08");
    expect(cancelled.status).toBe("cancelled");
  });

  it("reprices extras against the period the reservation actually holds", async () => {
    const provider = new MockInventoryProvider();
    const quote = await provider.addOrUpdateExtras({
      ref: { providerReservationId: "res_qte_mock_yacht_lagoon_52f_solenne_2026_08_22" },
      extras: ["skipper"],
    });

    expect(quote.listingId).toBe("ylst_yacht-lagoon-52f-solenne");
    expect(quote.checkIn).toBe("2026-08-22");
    expect(quote.checkOut).toBe("2026-08-29");
    expect(quote.repriced).toBe(true);
  });

  it("advertises the hold it actually grants", () => {
    const capabilities = new MockInventoryProvider().capabilities();

    expect(capabilities.supportsOptions).toBe(true);
    expect(capabilities.minHoldMinutes).toBe(48 * 60);
  });
});
