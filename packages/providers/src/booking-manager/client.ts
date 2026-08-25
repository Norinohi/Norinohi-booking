import type { z } from "zod";

import { ContractError, describeSchemaIssues } from "../shared/errors";
import type { JsonRequestValue, JsonValue } from "../shared/json";
import {
  createProviderHttpClient,
  type FetchLike,
  type ProviderHttpClient,
  type ProviderRequestOptions,
  type QueryValue,
  type RawResponseEvent,
} from "../shared/http-client";
import { parseExactJson } from "../shared/exact-json";
import { queueForInterval, SequentialQueue } from "../shared/queue";
import type { RetryPolicy } from "../shared/retry";
import type { BookingManagerConfig } from "./config";
import { bookingManagerEndpoints } from "./endpoints";

export interface BookingManagerClientOptions {
  config: BookingManagerConfig;
  fetchImpl?: FetchLike;
  queue?: SequentialQueue;
  retry?: Partial<RetryPolicy>;
  /** Raw retention hook; fires before classification, so error bodies land too. */
  onRawResponse?: (event: RawResponseEvent) => void | Promise<void>;
}

/**
 * `POST /requests` files a vendor-side request and is not idempotent: measured on
 * 2026-08-25, the first call answers `200` with an empty body and an identical
 * repeat answers `400 Error creating entity. Action not applicable for given
 * reservation`. A retry after a lost 200 therefore turns a filed request into an
 * error indistinguishable from one that was never permitted, and nothing on the
 * reservation can be read back to tell them apart.
 *
 * This is enforced here rather than left to the call site because the hazard is
 * precisely that someone wires the endpoint up and does not know about it.
 */
const NON_IDEMPOTENT_ENDPOINTS = new Set<string>([bookingManagerEndpoints.requests]);

function retryOptionsFor(endpoint: string): ProviderRequestOptions | undefined {
  return NON_IDEMPOTENT_ENDPOINTS.has(endpoint) ? { retry: { maxAttempts: 1 } } : undefined;
}

/**
 * Unlike NauSYS, Booking Manager signals failure with real HTTP status codes
 * (400/401/404/422), so the shared `httpStatusClassifier` default needs no
 * override. 422 falls through to ContractError, which is right: an unprocessable
 * obligatory field is a payload we got wrong, not something a retry fixes.
 */
export class BookingManagerClient {
  readonly config: BookingManagerConfig;
  private readonly http: ProviderHttpClient;

  constructor(options: BookingManagerClientOptions) {
    this.config = options.config;
    this.http = createProviderHttpClient({
      baseUrl: options.config.baseUrl,
      queueKey: options.config.queueKey,
      timeoutMs: options.config.timeoutMs,
      queue: options.queue ?? queueForInterval(options.config.minIntervalMs),
      headers: { authorization: `Bearer ${options.config.apiToken}` },
      onRawResponse: options.onRawResponse,
      // Without this the vendor's 19-digit ids are rounded before anything sees them,
      // and the id we send back on a quote or a booking is one we invented.
      parseJson: parseExactJson,
      fetchImpl: options.fetchImpl,
      retry: options.retry,
    });
  }

  /**
   * `options.queueKey` puts this one read on a lane of its own. The catalogue sweep
   * uses it to run a handful of `/yachts` reads at once; everything else leaves it
   * alone and shares the credential's single lane.
   */
  async get<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    query?: Record<string, QueryValue | undefined>,
    options?: ProviderRequestOptions,
  ): Promise<TOut> {
    const response = await this.http.get(endpoint, query, options);
    return this.parse(endpoint, schema, response.body);
  }

  /** Lane `slot` of the sweep's fan-out, spaced by `minIntervalMs` like any other. */
  sweepLane(name: string, slot: number): ProviderRequestOptions {
    return { queueKey: `${this.config.queueKey}:${name}#${slot}` };
  }

  async post<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonRequestValue,
  ): Promise<TOut> {
    const response = await this.http.post(endpoint, body, retryOptionsFor(endpoint));
    return this.parse(endpoint, schema, response.body);
  }

  async put<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body?: JsonRequestValue,
  ): Promise<TOut> {
    const response = await this.http.put(endpoint, body);
    return this.parse(endpoint, schema, response.body);
  }

  async del<TOut>(endpoint: string, schema: z.ZodType<TOut>): Promise<TOut> {
    const response = await this.http.del(endpoint);
    return this.parse(endpoint, schema, response.body);
  }

  private parse<TOut>(endpoint: string, schema: z.ZodType<TOut>, body: JsonValue): TOut {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ContractError(
        `Booking Manager response from ${endpoint} did not match the schema — ${describeSchemaIssues(parsed.error.issues)}`,
        { endpoint, payload: { issues: parsed.error.issues } },
      );
    }
    return parsed.data;
  }
}
