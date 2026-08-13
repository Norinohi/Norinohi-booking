import type { z } from "zod";

import { ContractError } from "../shared/errors";
import {
  createProviderHttpClient,
  type FetchLike,
  type ProviderHttpClient,
  type QueryValue,
  type RawResponseEvent,
} from "../shared/http-client";
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
      fetchImpl: options.fetchImpl,
      retry: options.retry,
    });
  }

  async get<TSchema extends z.ZodType>(
    endpoint: string,
    schema: TSchema,
    query?: Record<string, QueryValue | undefined>,
  ): Promise<z.output<TSchema>> {
    const response = await this.http.get(endpoint, query);
    return this.parse(endpoint, schema, response.body);
  }

  async post<TSchema extends z.ZodType>(
    endpoint: string,
    schema: TSchema,
    body: unknown,
  ): Promise<z.output<TSchema>> {
    const response = await this.http.post(endpoint, body);
    return this.parse(endpoint, schema, response.body);
  }

  async put<TSchema extends z.ZodType>(
    endpoint: string,
    schema: TSchema,
    body?: unknown,
  ): Promise<z.output<TSchema>> {
    const response = await this.http.put(endpoint, body);
    return this.parse(endpoint, schema, response.body);
  }

  async del<TSchema extends z.ZodType>(
    endpoint: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>> {
    const response = await this.http.del(endpoint);
    return this.parse(endpoint, schema, response.body);
  }

  private parse<TSchema extends z.ZodType>(
    endpoint: string,
    schema: TSchema,
    body: unknown,
  ): z.output<TSchema> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ContractError(
        `Booking Manager response from ${endpoint} did not match the schema`,
        { endpoint, payload: { issues: parsed.error.issues } },
      );
    }
    return parsed.data as z.output<TSchema>;
  }
}
