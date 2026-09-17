import { doc } from "@yacht-charter/api/presenters/listing.fixture";
import { presentListingSummary } from "@yacht-charter/api/presenters/listing";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../../messages/en";

import { toYachtCard } from "./to-yacht-card";

const t = createTranslator({ locale: "en", messages, namespace: "Common.boatCard" });
const tCrew = createTranslator({ locale: "en", messages, namespace: "Common.crewTypes" });
const tBadge = createTranslator({ locale: "en", messages, namespace: "Common.boatCard.badges" });
const money = (amountMinor: number, currency = "EUR") => `${currency} ${amountMinor / 100}`;

const daysAhead = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function card(listing: ReturnType<typeof presentListingSummary>, datesInCaption: boolean) {
  return toYachtCard(t, tCrew, tBadge, money, listing, undefined, "all_in", false, datesInCaption);
}

describe("toYachtCard caption on an undated map card", () => {
  const priced = presentListingSummary(
    doc({ bookableFrom: daysAhead(30), bookableTo: daysAhead(37), priceSource: "vendor" }),
  );

  it("names the priced charter's dates instead of its length", () => {
    expect(card(priced, true).priceLabel).toMatch(/^Charter price · for \S+ - \S+$/);
    expect(card(priced, false).priceLabel).toBe("Charter price · 7 days");
  });

  it("names no length for a figure with no charter behind it", () => {
    const floor = presentListingSummary(doc({ bookableFrom: null, bookableTo: null }));

    expect(card(floor, true).priceLabel).not.toMatch(/\d+ days?/);
  });
});
