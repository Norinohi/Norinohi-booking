import charterBases from "../fixtures/charterBases.json" with { type: "json" };
import charterCompanies from "../fixtures/charterCompanies.json" with { type: "json" };
import countries from "../fixtures/countries.json" with { type: "json" };
import createBooking from "../fixtures/createBooking.json" with { type: "json" };
import createInfo from "../fixtures/createInfo.json" with { type: "json" };
import createOption from "../fixtures/createOption.json" with { type: "json" };
import equipment from "../fixtures/equipment.json" with { type: "json" };
import equipmentCategories from "../fixtures/equipmentCategories.json" with { type: "json" };
import error100 from "../fixtures/error-100.json" with { type: "json" };
import error201 from "../fixtures/error-201.json" with { type: "json" };
import error402 from "../fixtures/error-402.json" with { type: "json" };
import error999 from "../fixtures/error-999.json" with { type: "json" };
import freeYachts from "../fixtures/freeYachts.json" with { type: "json" };
import freeYachtsSearch from "../fixtures/freeYachtsSearch.json" with { type: "json" };
import locations from "../fixtures/locations.json" with { type: "json" };
import occupancy from "../fixtures/occupancy.json" with { type: "json" };
import regions from "../fixtures/regions.json" with { type: "json" };
import services from "../fixtures/services.json" with { type: "json" };
import stornoOption from "../fixtures/stornoOption.json" with { type: "json" };
import yachtBuilders from "../fixtures/yachtBuilders.json" with { type: "json" };
import yachtCategories from "../fixtures/yachtCategories.json" with { type: "json" };
import yachtModels from "../fixtures/yachtModels.json" with { type: "json" };
import yachts102701 from "../fixtures/yachts-102701.json" with { type: "json" };

import type { FetchLike, ProviderHttpResponseLike } from "../../shared/http-client";

export const nausysFixtures: Record<string, unknown> = {
  charterBases,
  charterCompanies,
  countries,
  createBooking,
  createInfo,
  createOption,
  equipment,
  equipmentCategories,
  "error-100": error100,
  "error-201": error201,
  "error-402": error402,
  "error-999": error999,
  freeYachts,
  freeYachtsSearch,
  locations,
  occupancy,
  regions,
  services,
  stornoOption,
  yachtBuilders,
  yachtCategories,
  yachtModels,
  "yachts-102701": yachts102701,
};

export interface FakeNausysCall {
  url: string;
  /** Path below `/v6/`, e.g. `occupancy/102701/2026`. */
  endpoint: string;
  /** Fixture key the endpoint resolved to, e.g. `occupancy`. */
  key: string;
  body: Record<string, unknown>;
  startedAt: number;
}

interface QueuedResponse {
  body?: unknown;
  httpStatus?: number;
  /** Thrown from `fetch`, standing in for DNS/TLS/abort failures. */
  networkError?: Error;
  rawBody?: string;
}

export interface FakeNausysTransportOptions {
  /** Non-zero makes overlapping calls observable, which is how the sequential rule is asserted. */
  delayMs?: number;
  now?: () => number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fixture-backed `fetch` seam. The whole NauSYS adapter is exercised through
 * this in CI: no credentials, no network, and the vendor's HTTP-200-with-an-
 * error-body quirk reproduced exactly.
 */
export class FakeNausysTransport {
  readonly calls: FakeNausysCall[] = [];
  /** Peak overlapping calls. Must stay 1: the vendor forbids parallel requests. */
  maxConcurrent = 0;

  private readonly delayMs: number;
  private readonly now: () => number;
  private readonly persistent = new Map<string, QueuedResponse>();
  private readonly queued = new Map<string, QueuedResponse[]>();
  private inFlight = 0;

  constructor(options: FakeNausysTransportOptions = {}) {
    this.delayMs = options.delayMs ?? 0;
    this.now = options.now ?? Date.now;
  }

  /** Pass to `new NausysClient({ fetchImpl: transport.fetch })`. */
  readonly fetch: FetchLike = async (url, init) => {
    const endpoint = endpointOf(url);
    const key = fixtureKeyFor(endpoint);
    this.calls.push({
      url,
      endpoint,
      key,
      body: parseBody(init.body),
      startedAt: this.now(),
    });

    this.inFlight += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    try {
      if (this.delayMs > 0) {
        await delay(this.delayMs);
      }
      return this.respond(key, endpoint);
    } finally {
      this.inFlight -= 1;
    }
  };

  /** Replaces the fixture for every call to `key`. */
  respondWith(key: string, body: unknown, httpStatus = 200): this {
    this.persistent.set(key, { body, httpStatus });
    return this;
  }

  /** Applies to the next call to `key` only, so retry behaviour is testable. */
  respondOnceWith(key: string, body: unknown, httpStatus = 200): this {
    return this.enqueue(key, { body, httpStatus });
  }

  /** `failWith("freeYachts", "error-402")` serves an error fixture forever. */
  failWith(key: string, errorFixture: string): this {
    return this.respondWith(key, requireFixture(errorFixture));
  }

  failOnceWith(key: string, errorFixture: string): this {
    return this.enqueue(key, { body: requireFixture(errorFixture) });
  }

  failOnceWithNetworkError(key: string, error = new Error("fetch failed")): this {
    return this.enqueue(key, { networkError: error });
  }

  failOnceWithRawBody(key: string, rawBody: string, httpStatus = 200): this {
    return this.enqueue(key, { rawBody, httpStatus });
  }

  /** Fixture keys in call order; the ordering assertion the booking chain needs. */
  callSequence(): string[] {
    return this.calls.map((call) => call.key);
  }

  callCount(key: string): number {
    return this.calls.filter((call) => call.key === key).length;
  }

  lastBody(key: string): Record<string, unknown> | undefined {
    return this.calls.findLast((call) => call.key === key)?.body;
  }

  reset(): void {
    this.calls.length = 0;
    this.maxConcurrent = 0;
    this.inFlight = 0;
    this.persistent.clear();
    this.queued.clear();
  }

  private enqueue(key: string, response: QueuedResponse): this {
    const pending = this.queued.get(key) ?? [];
    pending.push(response);
    this.queued.set(key, pending);
    return this;
  }

  private respond(key: string, endpoint: string): ProviderHttpResponseLike {
    const override = this.queued.get(key)?.shift() ?? this.persistent.get(key);
    if (override?.networkError) {
      throw override.networkError;
    }
    if (override?.rawBody !== undefined) {
      return textResponse(override.httpStatus ?? 200, override.rawBody);
    }
    if (override) {
      return jsonResponse(override.httpStatus ?? 200, override.body);
    }

    const fixture = nausysFixtures[key];
    if (fixture === undefined) {
      throw new Error(`FakeNausysTransport has no fixture for "${endpoint}" (key "${key}")`);
    }
    return jsonResponse(200, fixture);
  }
}

function jsonResponse(status: number, body: unknown): ProviderHttpResponseLike {
  return textResponse(status, JSON.stringify(body));
}

function textResponse(status: number, text: string): ProviderHttpResponseLike {
  return { status, text: () => Promise.resolve(text) };
}

function requireFixture(key: string): unknown {
  const fixture = nausysFixtures[key];
  if (fixture === undefined) {
    throw new Error(`Unknown NauSYS fixture: ${key}`);
  }
  return fixture;
}

function parseBody(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function endpointOf(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "");
  const marker = "/v6/";
  const index = path.indexOf(marker);
  return index === -1 ? path.replace(/^\/+/, "") : path.slice(index + marker.length);
}

/**
 * `yachts/102701` resolves to `yachts-102701` if that fixture exists, otherwise
 * to `yachts`; `occupancy/102701/2026` falls back to `occupancy`. Path params
 * are dropped from the right so one fixture can serve every id.
 */
function fixtureKeyFor(endpoint: string): string {
  const segments = endpoint.split("/").filter(Boolean);
  for (let length = segments.length; length > 0; length -= 1) {
    const key = segments.slice(0, length).join("-");
    if (nausysFixtures[key] !== undefined) {
      return key;
    }
  }
  return segments[0] ?? endpoint;
}
