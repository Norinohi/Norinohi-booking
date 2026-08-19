import type { z } from "zod";

import { ContractError, describeSchemaIssues } from "../shared/errors";
import type { JsonRequestValue, JsonValue } from "../shared/json";
import {
  createProviderHttpClient,
  type FetchLike,
  type ProviderHttpClient,
  type QueryValue,
  type RawResponseEvent,
} from "../shared/http-client";
import { parseExactJson } from "../shared/exact-json";
import { queueForInterval, SequentialQueue } from "../shared/queue";
import type { RetryPolicy } from "../shared/retry";
import type { BookingManagerConfig } from "./config";

export interface BookingManagerClientOptions {
  config: BookingManagerConfig;
  fetchImpl?: FetchLike;
  queue?: SequentialQueue;
  retry?: Partial<RetryPolicy>;
  /** Raw retention hook; fires before classification, so error bodies land too. */
  onRawResponse?: (event: RawResponseEvent) => void | Promise<void>;
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

  async get<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    query?: Record<string, QueryValue | undefined>,
  ): Promise<TOut> {
    const response = await this.http.get(endpoint, query);
    return this.parse(endpoint, schema, response.body);
  }

  async post<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonRequestValue,
  ): Promise<TOut> {
    const response = await this.http.post(endpoint, body);
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
