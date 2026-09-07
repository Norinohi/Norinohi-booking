import { describe, expect, it } from "vitest";

import { DEPOSIT_INSURANCE_PATTERN, PETS_HEDGE_PATTERN, PETS_PATTERN } from "./offer-flags";

/*
 * The rule itself is SQL, so what these pin is the one part that can be got wrong silently: which
 * vendor fee names the patterns match. Every string below is a real `provider_extra_catalogue.name`
 * from the synced catalogue, kept verbatim.
 *
 * `~*` in Postgres and a case-insensitive JS RegExp agree on the constructs used here (character
 * classes, alternation, anchors), so the pattern a test compiles is the pattern the update runs.
 */
const pets = new RegExp(PETS_PATTERN, "i");
const hedge = new RegExp(PETS_HEDGE_PATTERN, "i");
const insurance = new RegExp(DEPOSIT_INSURANCE_PATTERN, "i");

const allowsPets = (name: string) => pets.test(name) && !hedge.test(name);

describe("pets", () => {
  it.each([
    "Pet on board",
    "Dog on board",
    "Pet fee (per pet)",
    "Pets allowed (up to 7 kg)",
    "Extra cleaning for animal",
    "Pets (only on request)",
  ])("reads %j as an operator that takes animals", (name) => {
    expect(allowsPets(name)).toBe(true);
  });

  /*
   * The reason the pattern is word-bounded rather than a plain `pet`: NauSYS files the fuel line
   * on thousands of offers, and "carpet" is an amenity. Either would have advertised pets on a
   * boat that takes none.
   */
  it.each([
    "05. Extra Additional fuel tank, portable for 5L gasoline/petrol",
    "Carpet",
    "Water floating carpet",
    "Competition",
  ])("does not read %j as being about animals", (name) => {
    expect(allowsPets(name)).toBe(false);
  });

  /* A cleaning fee that hedges on permission is not permission; it was the only pet row on 125
     listings, each of which would otherwise have claimed pets were welcome. */
  it("refuses a fee that only applies if pets turn out to be allowed", () => {
    expect(pets.test("Cleaning for pets (if allowed)")).toBe(true);
    expect(allowsPets("Cleaning for pets (if allowed)")).toBe(false);
  });
});

describe("deposit insurance", () => {
  it.each([
    "Deposit insurance",
    "Damage waiver",
    "Security Deposit Waiver",
    "Damage waiver Gold option",
    "Comfort pack with insurance of deposit",
    "Non refundable deposit/ insurance",
  ])("recognises %j as cover for the deposit", (name) => {
    expect(insurance.test(name)).toBe(true);
  });

  it.each(["Deposit", "Travel insurance", "Skipper", "Final cleaning"])(
    "does not recognise %j",
    (name) => {
      expect(insurance.test(name)).toBe(false);
    },
  );
});
