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

  it("prices only the skipper for a skippered charter, and every role for full crew", async () => {
    const provider = new MockInventoryProvider();
    const period = {
      listingId: "ylst_yacht-lagoon-42-aurora",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 8,
      extras: [],
      currency: "EUR",
    };

    const bareboat = await provider.getQuote({ ...period, crewType: "bareboat" });
    const skippered = await provider.getQuote({ ...period, crewType: "skipper" });
    const fullCrew = await provider.getQuote({ ...period, crewType: "full-crew" });

    const crewCodes = (quote: Awaited<ReturnType<typeof provider.getQuote>>) =>
      quote.lines.filter((line) => line.group === "crew").map((line) => line.code);

    expect(crewCodes(bareboat)).toEqual([]);
    expect(crewCodes(skippered)).toEqual(["skipper"]);
    expect(crewCodes(fullCrew)).toEqual(["skipper", "hostess", "cook"]);

    // Each step up in crew costs strictly more, and the choice is echoed back.
    expect(skippered.total.amountMinor).toBeGreaterThan(bareboat.total.amountMinor);
    expect(fullCrew.total.amountMinor).toBeGreaterThan(skippered.total.amountMinor);
    expect(fullCrew.crewType).toBe("full-crew");
  });

  it("fingerprints the crew choice, so checkout cannot commit a different one", async () => {
    const provider = new MockInventoryProvider();
    const period = {
      listingId: "ylst_yacht-lagoon-42-aurora",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 8,
      extras: [],
      currency: "EUR",
    };

    const bareboat = await provider.getQuote({ ...period, crewType: "bareboat" });
    const fullCrew = await provider.getQuote({ ...period, crewType: "full-crew" });

    expect(bareboat.priceSourceHash).not.toBe(fullCrew.priceSourceHash);
  });

  it("groups obligatory fees, optional extras and crew apart", async () => {
    const provider = new MockInventoryProvider();
    const quote = await provider.getQuote({
      listingId: "ylst_yacht-lagoon-42-aurora",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 8,
      extras: ["sup"],
      crewType: "skipper",
      currency: "EUR",
    });

    const groupOf = (code: string) => quote.lines.find((line) => line.code === code)?.group;

    expect(groupOf("transit-log")).toBe("mandatory");
    expect(groupOf("sup")).toBe("optional");
    expect(groupOf("skipper")).toBe("crew");
    // The charter itself is in no section: it is the price the sections hang off.
    expect(groupOf("base-charter")).toBeUndefined();
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
    const { providerReservationId } = option;
    if (!providerReservationId) throw new Error("the mock opened no reservation");

    const confirmed = await provider.confirmBooking({
      ...draft,
      reservation: {
        providerReservationId,
        providerOptionId: option.providerOptionId,
        securityToken: option.securityToken,
      },
    });
    const cancelled = await provider.cancelOption({
      providerReservationId,
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
