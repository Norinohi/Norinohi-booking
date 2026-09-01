import type { z } from "zod";

import {
  AuthError,
  ContractError,
  describeSchemaIssues,
  NotFoundError,
  type ProviderError,
  TransientError,
} from "../shared/errors";
import {
  createProviderHttpClient,
  type FetchLike,
  httpStatusClassifier,
  type ProviderHttpClient,
  type RawResponseEvent,
} from "../shared/http-client";
import type { JsonObject, JsonValue } from "../shared/json";
import { queueForInterval, SequentialQueue } from "../shared/queue";
import type { RetryPolicy } from "../shared/retry";
import type { NausysConfig } from "./config";
import { NAUSYS_STATUS_CODES, NAUSYS_STATUS_NAMES, restStatusSchema } from "./endpoints";

type ErrorFactory = (
  message: string,
  options: { endpoint: string; providerCode: string; payload: unknown },
) => ProviderError;

const authError: ErrorFactory = (message, options) => new AuthError(message, options);
const contractError: ErrorFactory = (message, options) => new ContractError(message, options);
const notFoundError: ErrorFactory = (message, options) => new NotFoundError(message, options);
const transientError: ErrorFactory = (message, options) => new TransientError(message, options);

/**
 * The vendor's full status table. Nothing here is retried except UNKNOWN_ERROR:
 * a bad yacht id or a permission problem returns the same answer forever, and
 * retrying it only burns the single sequential lane.
 */
const ERROR_BY_CODE = new Map<number, ErrorFactory>([
  [NAUSYS_STATUS_CODES.AUTHENTICATION_ERROR, authError],
  [NAUSYS_STATUS_CODES.OPERATION_NOT_ALLOWED, authError],
  [NAUSYS_STATUS_CODES.INSUFFICIENT_DATA, contractError],
  [NAUSYS_STATUS_CODES.INVALID_DATE_FORMAT, contractError],
  [NAUSYS_STATUS_CODES.INVALID_NUMBER_FORMAT, contractError],
  [NAUSYS_STATUS_CODES.INVALID_EMAIL_FORMAT, contractError],
  [NAUSYS_STATUS_CODES.CREW_LIST_LOCKED, contractError],
  [NAUSYS_STATUS_CODES.CREW_LIST_VALIDATION_FAILED, contractError],
  [NAUSYS_STATUS_CODES.INVALID_COUNTRY_ID, contractError],
  [NAUSYS_STATUS_CODES.INVALID_YACHT_ID, notFoundError],
  // Permission and configuration, not authentication, but equally hopeless to
  // retry and equally worth alerting on.
  [NAUSYS_STATUS_CODES.WRONG_YACHT_OWNERSHIP, authError],
  [NAUSYS_STATUS_CODES.NOT_ALLOWED_TO_BOOK_THIS_YACHT, authError],
  [NAUSYS_STATUS_CODES.INVALID_PAYMENT_METHOD, authError],
  [NAUSYS_STATUS_CODES.INVALID_CURRENCY, authError],
  [NAUSYS_STATUS_CODES.UNKNOWN_ERROR, transientError],
]);

const statusCodesByName = new Map<string, number>(Object.entries(NAUSYS_STATUS_CODES));

function statusCodeOf(status: string, errorCode: number | undefined): number | undefined {
  if (errorCode !== undefined) {
    return errorCode;
  }
  // The vendor sends status names we do not have a code for; those stay undefined.
  return statusCodesByName.get(status);
}

/**
 * NauSYS answers HTTP 200 for everything, including authentication failures, so
 * classification reads the body. The HTTP status is still checked first to catch
 * an infrastructure error (proxy 502, maintenance page) before we try to read a
 * vendor status out of it.
 */
export function classifyNausysResponse(
  httpStatus: number,
  body: JsonValue,
  context: { endpoint: string },
): ProviderError | null {
  const httpError = httpStatusClassifier(httpStatus, body, context);
  if (httpError) {
    return httpError;
  }

  const envelope = restStatusSchema.safeParse(body);
  if (!envelope.success) {
    return new ContractError(`NauSYS response from ${context.endpoint} carried no status`, {
      endpoint: context.endpoint,
      payload: body,
    });
  }

  const { status, errorCode } = envelope.data;
  const code = statusCodeOf(status, errorCode);
  if (status === "OK" || code === NAUSYS_STATUS_CODES.OK) {
    return null;
  }

  const options = {
    endpoint: context.endpoint,
    providerCode: code === undefined ? status : (NAUSYS_STATUS_NAMES[code] ?? status),
    payload: body,
  };
  const factory = code === undefined ? contractError : (ERROR_BY_CODE.get(code) ?? contractError);
  return factory(`NauSYS ${context.endpoint} failed with ${status}`, options);
}

/**
 * Which calls serialize against which.
 *
 * The vendor's sequential-only rule turned out to be narrower than its
 * implementation guidelines read. NauSYS confirmed (Aug 2026) that "all live calls
 * from the customer regarding booking flow will not be affected by parallel
 * request restriction" — so the restriction is really about the background
 * catalogue and availability sweeps, which is exactly what a multi-hour sync
 * blocking a checkout price check was the danger of.
 *
 * - `sync` is the one lane per credential the rule still governs: catalogue dumps
 *   and occupancy sweeps, spaced by `minIntervalMs`.
 * - `live` is unserialized. Quote and availability checks issued for a customer
 *   in front of a checkout page run as they arrive.
 * - `reservation:<id>` serializes per reservation. That one is ours, not the
 *   vendor's: the `uuid` rotates on every write, so two concurrent calls on one
 *   reservation would send the same token twice and the second would be refused.
 */
export type NausysLane = "sync" | "live" | `reservation:${string}`;

export function reservationLane(providerReservationId: string): NausysLane {
  return `reservation:${providerReservationId}`;
}

export interface NausysClientOptions {
  config: NausysConfig;
  fetchImpl?: FetchLike;
  queue?: SequentialQueue;
  retry?: Partial<RetryPolicy>;
  /** Raw retention hook; fires before classification, so error bodies land too. */
  onRawResponse?: (event: RawResponseEvent) => void | Promise<void>;
  /** Lane for calls that do not name one. Live, because most callers are. */
  lane?: NausysLane;
}

export class NausysClient {
  readonly config: NausysConfig;
  private readonly options: NausysClientOptions;
  private readonly lane: NausysLane;
  private readonly http: ProviderHttpClient;
  /** Makes each live call its own lane key, which is what "not serialized" means. */
  private liveCalls = 0;

  constructor(options: NausysClientOptions) {
    this.config = options.config;
    this.options = options;
    this.lane = options.lane ?? "live";
    this.http = createProviderHttpClient({
      baseUrl: options.config.baseUrl,
      queueKey: options.config.queueKey,
      // The sync lane alone gets the long ceiling: a fleet dump is slow by nature,
      // while every other lane is answering a guest and must fail fast.
      timeoutMs: this.lane === "sync" ? options.config.syncTimeoutMs : options.config.timeoutMs,
      queue: options.queue ?? queueForInterval(options.config.minIntervalMs),
      classifyResponse: classifyNausysResponse,
      onRawResponse: options.onRawResponse,
      fetchImpl: options.fetchImpl,
      retry: options.retry,
    });
  }

  /** The same credential and transport, issuing its calls on another lane. */
  forLane(lane: NausysLane): NausysClient {
    return lane === this.lane ? this : new NausysClient({ ...this.options, lane });
  }

  /**
   * Catalogue shape: credentials sit at the TOP LEVEL of the body. Occupancy
   * uses this shape too, despite living under `yachtReservation/v6` alongside
   * `freeYachts`, which uses the nested one.
   */
  catalogueCall<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonObject = {},
    lane?: NausysLane,
  ): Promise<TOut> {
    return this.call(
      endpoint,
      schema,
      {
        username: this.config.username,
        password: this.config.password,
        ...body,
      },
      lane,
    );
  }

  /** Reservation and booking shape: credentials nested under `credentials`. */
  bookingCall<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonObject = {},
    lane?: NausysLane,
  ): Promise<TOut> {
    return this.call(
      endpoint,
      schema,
      {
        credentials: { username: this.config.username, password: this.config.password },
        ...body,
      },
      lane,
    );
  }

  /**
   * A plain GET, for the one NauSYS surface that authorises by URL rather than by credentials:
   * the crew list, whose `securityCode` path segment is the reservation's own rotating token.
   * On the live lane, since a customer is looking at the page that asked for it.
   */
  async getJson<TOut>(path: string, schema: z.ZodType<TOut>): Promise<TOut> {
    const response = await this.http.get(path, undefined, {
      queueKey: this.queueKeyFor("live"),
    });
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new ContractError(`NauSYS ${path} did not match the expected schema`, {
        endpoint: path,
      });
    }
    return parsed.data;
  }

  /**
   * The same, posting. Used only by the crew list, whose write authorises by the URL token
   * and therefore carries no credentials in the body.
   */
  async postJson<TOut>(path: string, body: JsonObject, schema: z.ZodType<TOut>): Promise<TOut> {
    const response = await this.http.post(path, body, {
      queueKey: this.queueKeyFor("live"),
    });
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new ContractError(`NauSYS ${path} did not match the expected schema`, {
        endpoint: path,
      });
    }
    return parsed.data;
  }

  /**
   * A live call gets a key nothing else uses, so the queue admits it immediately;
   * every other lane is a stable key and therefore a real one-at-a-time lane.
   */
  private queueKeyFor(lane: NausysLane): string {
    if (lane === "live") {
      this.liveCalls += 1;
      return `${this.config.queueKey}:live#${this.liveCalls}`;
    }
    return `${this.config.queueKey}:${lane}`;
  }

  private async call<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonObject,
    lane: NausysLane = this.lane,
  ): Promise<TOut> {
    const response = await this.http.post(endpoint, body, {
      queueKey: this.queueKeyFor(lane),
    });
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new ContractError(
        `NauSYS response from ${endpoint} did not match the schema — ${describeSchemaIssues(parsed.error.issues)}`,
        { endpoint, payload: { issues: parsed.error.issues } },
      );
    }
    return parsed.data;
  }
}
