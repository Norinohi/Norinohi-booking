import { describe, expect, it } from "vitest";

import type { ProviderRecordSet } from "../types";
import { projectBookingManagerCatalogue } from "./projection";

function records(countries: unknown[]): ProviderRecordSet {
  return new Map([
    [
      "country" as const,
      countries.map((payload, index) => ({ externalId: String(index), payload })),
    ],
  ]);
}

/**
 * The Swagger declares the ISO fields as `short`/`long`; the worked example in the
 * vendor's integration guide returns `shortName`/`longName`. The schemas are loose,
 * so reading only one spelling would not throw. It would silently drop every
 * country code, and that code is what merges a country across providers.
 */
describe("country codes across both vendor spellings", () => {
  it("reads the Swagger spelling", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", short: "IT", long: "ITA", worldRegion: 16 }]),
    );

    expect(countries).toEqual([{ externalId: "380", code: "IT", name: "Italy" }]);
  });

  it("reads the integration-guide spelling", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", shortName: "IT", longName: "ITA", worldRegion: 16 }]),
    );

    expect(countries).toEqual([{ externalId: "380", code: "IT", name: "Italy" }]);
  });

  it("falls back to a namespaced code only when neither spelling carries one", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", worldRegion: 16 }]),
    );

    expect(countries[0]?.code).toBe("booking_manager-380");
  });

  it("names a country from longName when name is absent", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, shortName: "IT", longName: "ITA", worldRegion: 16 }]),
    );

    expect(countries[0]?.name).toBe("ITA");
  });
});
