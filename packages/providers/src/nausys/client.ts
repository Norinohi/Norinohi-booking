import type { z } from "zod";

import {
  AuthError,
  ContractError,
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

export interface NausysClientOptions {
  config: NausysConfig;
  fetchImpl?: FetchLike;
  queue?: SequentialQueue;
  retry?: Partial<RetryPolicy>;
  /** Raw retention hook; fires before classification, so error bodies land too. */
  onRawResponse?: (event: RawResponseEvent) => void | Promise<void>;
}

export class NausysClient {
  readonly config: NausysConfig;
  private readonly http: ProviderHttpClient;

  constructor(options: NausysClientOptions) {
    this.config = options.config;
    this.http = createProviderHttpClient({
      baseUrl: options.config.baseUrl,
      queueKey: options.config.queueKey,
      timeoutMs: options.config.timeoutMs,
      queue: options.queue ?? queueForInterval(options.config.minIntervalMs),
      classifyResponse: classifyNausysResponse,
      onRawResponse: options.onRawResponse,
      fetchImpl: options.fetchImpl,
      retry: options.retry,
    });
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
  ): Promise<TOut> {
    return this.call(endpoint, schema, {
      username: this.config.username,
      password: this.config.password,
      ...body,
    });
  }

  /** Reservation and booking shape: credentials nested under `credentials`. */
  bookingCall<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonObject = {},
  ): Promise<TOut> {
    return this.call(endpoint, schema, {
      credentials: { username: this.config.username, password: this.config.password },
      ...body,
    });
  }

  private async call<TOut>(
    endpoint: string,
    schema: z.ZodType<TOut>,
    body: JsonObject,
  ): Promise<TOut> {
    const response = await this.http.post(endpoint, body);
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new ContractError(`NauSYS response from ${endpoint} did not match the schema`, {
        endpoint,
        payload: { issues: parsed.error.issues },
      });
    }
    return parsed.data;
  }
}
