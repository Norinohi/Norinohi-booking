import { describe, expect, it, vi } from "vitest";

// registry.ts and config.ts both read the server env at import time. Hoisted so it
// lands before those module evaluations; the tests pass mode and config explicitly.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { MockInventoryProvider } from "./mock/provider";
import { NausysInventoryProvider } from "./nausys/provider";
import { resolveNausysConfig } from "./nausys/config";
import { AuthError } from "./shared/errors";
import type { Database } from "./registry";
import { createInventoryProvider } from "./registry";

// The registry only stores the handle; nothing here reaches the database.
const db = {} as Database;

const testConfig = resolveNausysConfig({
  NAUSYS_BASE_URL: "https://ws-test.nausys.com/",
  NAUSYS_USERNAME: "agency@example.com",
  NAUSYS_PASSWORD: "secret",
  NAUSYS_TIMEOUT_MS: 30_000,
  NAUSYS_MIN_INTERVAL_MS: 250,
  NAUSYS_OPTION_SAFETY_MARGIN_MINUTES: 15,
  NAUSYS_OPTION_TIMEZONE: "Europe/Zagreb",
});

describe("createInventoryProvider", () => {
  it("returns the mock adapter in mock mode", () => {
    const provider = createInventoryProvider({ db }, "mock");

    expect(provider).toBeInstanceOf(MockInventoryProvider);
    expect(provider.key).toBe("mock");
  });

  it("returns the NauSYS adapter in nausys mode", () => {
    const provider = createInventoryProvider({ db, nausysConfig: testConfig }, "nausys");

    expect(provider).toBeInstanceOf(NausysInventoryProvider);
    expect(provider.key).toBe("nausys");
  });

  it("still refuses booking_manager", () => {
    expect(() => createInventoryProvider({ db }, "booking_manager")).toThrow(/not implemented/i);
  });
});

describe("nausys capabilities", () => {
  it("advertises provider-owned option expiry and live quoting", () => {
    const provider = new NausysInventoryProvider({ db, config: testConfig });

    expect(provider.capabilities()).toEqual({
      supportsOptions: true,
      supportsWebhooks: false,
      optionExpiryOwnedByProvider: true,
      supportsExtrasMutation: true,
      supportsLiveQuote: true,
      minHoldMinutes: 15,
    });
  });
});

describe("resolveNausysConfig", () => {
  it("refuses to build a config without credentials", () => {
    // Credentials are optional in the env schema so a missing secret cannot stop
    // the server booting; this is the point that has to fail loudly instead.
    expect(() =>
      resolveNausysConfig({
        NAUSYS_BASE_URL: "https://ws.nausys.com",
        NAUSYS_USERNAME: undefined,
        NAUSYS_PASSWORD: undefined,
        NAUSYS_TIMEOUT_MS: 30_000,
        NAUSYS_MIN_INTERVAL_MS: 250,
        NAUSYS_OPTION_SAFETY_MARGIN_MINUTES: 15,
        NAUSYS_OPTION_TIMEZONE: "Europe/Zagreb",
      }),
    ).toThrow(AuthError);
  });

  it("keys the queue by credential so every instance shares one lane", () => {
    // The vendor forbids parallel calls per credential, so two adapters built in
    // one process must serialize against each other, not just against themselves.
    const a = new NausysInventoryProvider({ db, config: testConfig });
    const b = new NausysInventoryProvider({ db, config: testConfig });

    expect(a).not.toBe(b);
    expect(testConfig.queueKey).toBe("nausys:agency@example.com");
  });

  it("trims the trailing slash so endpoint joins cannot double up", () => {
    expect(testConfig.baseUrl).toBe("https://ws-test.nausys.com");
  });
});
