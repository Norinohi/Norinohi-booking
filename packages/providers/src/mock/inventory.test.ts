import { describe, expect, it } from "vitest";

import { NotFoundError } from "../shared/errors";
import {
  fixtureInventorySource,
  resolveReference,
  type MockInventorySource,
  type MockSlot,
} from "./inventory";
import { MockInventoryProvider } from "./provider";

const slot = (over: Partial<MockSlot> = {}): MockSlot => ({
  listingId: "ylst_yacht-sunreef-80-verano",
  yachtId: "yacht-sunreef-80-verano",
  startDate: "2026-07-18",
  endDate: "2026-07-25",
  status: "available",
  priceMinor: 6_848_000,
  currency: "EUR",
  minNights: 7,
  checkinWeekday: 6,
  checkoutWeekday: 6,
  ...over,
});

/** Stands in for the catalogue: one yacht the fixtures have never heard of. */
function sourceOf(slots: MockSlot[]): MockInventorySource {
  const of = (listingId: string) => slots.filter((item) => item.listingId === listingId);

  return {
    async findSlot(listingId, checkIn, checkOut) {
      return (
        of(listingId).find((item) => item.startDate === checkIn && item.endDate === checkOut) ??
        null
      );
    },
    async findSlotByStart(listingId, startDate) {
      return of(listingId).find((item) => item.startDate === startDate) ?? null;
    },
    async listSlots(listingId, from, to) {
      return of(listingId).filter((item) => item.startDate >= from && item.endDate <= to);
    },
  };
}

describe("inventory source", () => {
  it("quotes a listing the fixtures do not contain", async () => {
    // The reported bug: availability.calendar published these weeks from the
    // database while the provider only knew ten fixture yachts, so every quote
    // on the other sixty-two came back as a conflict.
    const listingId = "ylst_yacht-sunreef-80-verano";
    const period = { listingId, checkIn: "2026-07-18", checkOut: "2026-07-25" };

    await expect(
      new MockInventoryProvider().getQuote({ ...period, guests: 4, extras: [], currency: "EUR" }),
    ).rejects.toThrow(/not available/);

    const quote = await new MockInventoryProvider({ inventory: sourceOf([slot()]) }).getQuote({
      ...period,
      guests: 4,
      extras: [],
      currency: "EUR",
    });

    expect(quote.lines.find((line) => line.kind === "base")?.amount.amountMinor).toBe(6_848_000);
    expect(quote.providerSourceId).toBe("mock:yacht-sunreef-80-verano");
  });

  it("refuses a period the source reports as anything but available", async () => {
    const provider = new MockInventoryProvider({
      inventory: sourceOf([slot({ status: "option" })]),
    });

    await expect(
      provider.getQuote({
        listingId: "ylst_yacht-sunreef-80-verano",
        checkIn: "2026-07-18",
        checkOut: "2026-07-25",
        guests: 4,
        extras: [],
        currency: "EUR",
      }),
    ).rejects.toThrow(/not available/);
  });

  it("serves the calendar from the same source it quotes from", async () => {
    const provider = new MockInventoryProvider({ inventory: sourceOf([slot()]) });

    const calendar = await provider.getAvailability({
      listingId: "ylst_yacht-sunreef-80-verano",
      from: "2026-07-01",
      to: "2026-08-01",
    });

    expect(calendar.slots).toHaveLength(1);
    expect(calendar.slots[0]?.price?.amountMinor).toBe(6_848_000);
  });
});

describe("resolveReference", () => {
  const inventory = sourceOf([slot()]);

  it("reads a yacht and period out of a reservation reference", async () => {
    const located = await resolveReference(
      "res_qte_mock_yacht_sunreef_80_verano_2026_07_18",
      inventory,
    );

    expect(located).toMatchObject({
      yachtId: "yacht-sunreef-80-verano",
      listingId: "ylst_yacht-sunreef-80-verano",
      checkIn: "2026-07-18",
      checkOut: "2026-07-25",
    });
  });

  it("reads an option reference the same way", async () => {
    const located = await resolveReference(
      "opt_qte_mock_yacht_sunreef_80_verano_2026_07_18",
      inventory,
    );

    expect(located.quoteId).toBe("qte_mock_yacht_sunreef_80_verano_2026_07_18");
  });

  it("rejects a reference it cannot read rather than guessing a yacht", async () => {
    await expect(resolveReference("res_nonsense", inventory)).rejects.toThrow(NotFoundError);
  });

  it("rejects a period the inventory no longer has", async () => {
    await expect(
      resolveReference("res_qte_mock_yacht_sunreef_80_verano_2026_09_19", inventory),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("fixtureInventorySource", () => {
  it("still answers for the yachts the fixtures cover", async () => {
    const found = await fixtureInventorySource().findSlot(
      "ylst_yacht-lagoon-42-aurora",
      "2026-08-08",
      "2026-08-15",
    );

    expect(found?.status).toBe("available");
  });

  it("knows nothing about the rest of the catalogue", async () => {
    const found = await fixtureInventorySource().findSlot(
      "ylst_yacht-sunreef-80-verano",
      "2026-07-18",
      "2026-07-25",
    );

    expect(found).toBeNull();
  });
});
