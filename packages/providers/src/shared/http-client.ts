import { randomUUID } from "node:crypto";

import {
  AuthError,
  ContractError,
  NotFoundError,
  type ProviderError,
  RateLimitedError,
  TransientError,
} from "./errors";
import type { JsonRequestValue, JsonValue } from "./json";
import { type SequentialQueue, sharedQueue } from "./queue";
import type { RetryPolicy } from "./retry";
import { withRetry } from "./retry";

/**
 * Structural stand-ins for the two `fetch` types we touch. Declaring them here
 * rather than leaning on the DOM/undici globals keeps the seam trivial to fake:
 * a test double returns a plain object, never a real `Response`.
 */
export interface ProviderHttpRequestInit {
  method: string;
  headers: Record<string, string>;
  /** Absent on GET: a body would be discarded, and some hosts reject it outright. */
  body?: string;
  signal: AbortSignal;
}

export interface ProviderHttpResponseLike {
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: ProviderHttpRequestInit,
) => Promise<ProviderHttpResponseLike>;

export interface ProviderHttpResult {
  body: JsonValue;
  httpStatus: number;
  durationMs: number;
  /** Identifies one HTTP attempt, so a retried call produces several. */
  requestId: string;
}

export interface RawResponseEvent extends ProviderHttpResult {
  endpoint: string;
}

/**
 * Decides whether a completed HTTP exchange is a failure. Returning `null` means
 * success. This is the whole reason the client is provider-neutral: NauSYS
 * answers HTTP 200 with `{"status":"AUTHENTICATION_ERROR"}` in the body, while
 * Booking Manager uses real HTTP status codes.
 */
export type ResponseClassifier = (
  httpStatus: number,
  body: JsonValue,
  context: { endpoint: string },
) => ProviderError | null;

export interface ProviderHttpClientOptions {
  baseUrl: string;
  queueKey: string;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  queue?: SequentialQueue;
  classifyResponse?: ResponseClassifier;
  /** Called with the untouched parsed body so callers can retain raw before mapping. */
  onRawResponse?: (event: RawResponseEvent) => void | Promise<void>;
  headers?: Record<string, string>;
  /**
   * How a response body becomes a value. Defaults to `JSON.parse`.
   *
   * Booking Manager overrides it with `parseExactJson`, because `JSON.parse` rounds
   * its 19-digit ids. Per client rather than global: NauSYS's ids are small, and
   * changing their shape would be blast radius for no defect.
   */
  parseJson?: (text: string) => JsonValue;
  fetchImpl?: FetchLike;
  now?: () => number;
  newRequestId?: () => string;
}

export type QueryValue = string | number | boolean | Array<string | number>;

/**
 * Per-call overrides. Today only the serialization lane.
 *
 * Two callers vary it, for opposite reasons. NauSYS gives a live call a key nothing
 * else uses so it is not queued behind a sweep; Booking Manager's catalogue sweep
 * spreads itself over a fixed set of keys so several of its reads run at once. Both
 * still pay the queue's spacing - per lane, which is what makes the second one a
 * concurrency setting rather than a way around the interval.
 */
export interface ProviderRequestOptions {
  /**
   * Lane this one call serializes on, instead of the client's own. Calls sharing
   * a key run one at a time; a key nothing else uses runs immediately.
   */
  queueKey?: string;
  /**
   * Overrides the client's retry policy for this one call, merged over it. A
   * `maxAttempts: 1` here is how a non-idempotent write opts out: replaying it
   * would file the vendor-side effect twice.
   */
  retry?: Partial<RetryPolicy>;
}

export interface ProviderHttpClient {
  post(
    endpoint: string,
    body: JsonRequestValue,
    options?: ProviderRequestOptions,
  ): Promise<ProviderHttpResult>;
  /** Booking Manager serves every read as GET with query parameters. */
  get(
    endpoint: string,
    query?: Record<string, QueryValue | undefined>,
    options?: ProviderRequestOptions,
  ): Promise<ProviderHttpResult>;
  del(endpoint: string): Promise<ProviderHttpResult>;
  put(endpoint: string, body?: JsonRequestValue): Promise<ProviderHttpResult>;
}

/**
 * Repeats a key per array element (`?yachtId=1&yachtId=2`) rather than joining
 * with commas. Booking Manager's spec declares these as arrays but does not
 * document the encoding; this is the single place to switch if the vendor
 * confirms otherwise.
 */
export function buildQueryString(query: Record<string, QueryValue | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }
    params.append(key, String(value));
  }
  const serialized = params.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

const defaultFetch: FetchLike = (url, init) => globalThis.fetch(url, init);

/** Transport-level fallback for providers that do signal failure over HTTP status. */
export const httpStatusClassifier: ResponseClassifier = (httpStatus, body, { endpoint }) => {
  if (httpStatus >= 200 && httpStatus < 300) {
    return null;
  }
  const options = { endpoint, providerCode: String(httpStatus), payload: body };
  if (httpStatus === 401 || httpStatus === 403) {
    return new AuthError(`Provider rejected credentials (HTTP ${httpStatus})`, options);
  }
  if (httpStatus === 404) {
    return new NotFoundError(`Provider resource not found (HTTP 404)`, options);
  }
  if (httpStatus === 429) {
    return new RateLimitedError(`Provider rate limited the request (HTTP 429)`, options);
  }
  if (httpStatus === 408 || httpStatus >= 500) {
    return new TransientError(`Provider returned HTTP ${httpStatus}`, options);
  }
  return new ContractError(`Provider returned HTTP ${httpStatus}`, options);
};

function joinUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

/** One line of the body, enough to tell an HTML error page from a truncated payload. */
function preview(text: string, limit = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat || "(empty)";
}

export function createProviderHttpClient(options: ProviderHttpClientOptions): ProviderHttpClient {
  const {
    baseUrl,
    queueKey,
    timeoutMs = 30_000,
    queue = sharedQueue,
    classifyResponse = httpStatusClassifier,
    onRawResponse,
    parseJson = JSON.parse,
    fetchImpl = defaultFetch,
    now = Date.now,
    newRequestId = randomUUID,
  } = options;

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...options.headers,
  };

  async function attempt(
    method: string,
    endpoint: string,
    body: JsonRequestValue,
    hasBody: boolean,
  ): Promise<ProviderHttpResult> {
    const requestId = newRequestId();
    const startedAt = now();

    // A GET carries no content-type: sending one invites a 415 from hosts that
    // validate it against an absent body.
    const requestHeaders = hasBody
      ? headers
      : Object.fromEntries(
          Object.entries(headers).filter(([key]) => key.toLowerCase() !== "content-type"),
        );

    const init: ProviderHttpRequestInit = {
      method,
      headers: requestHeaders,
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (hasBody) init.body = JSON.stringify(body);

    let response: ProviderHttpResponseLike;
    let text: string;
    try {
      response = await fetchImpl(joinUrl(baseUrl, endpoint), init);
      text = await response.text();
    } catch (cause) {
      // withRetry only ever retries a ProviderError, so an unwrapped DNS/abort
      // failure would be given up on immediately.
      throw new TransientError(`Request to ${endpoint} failed`, { endpoint, cause });
    }

    const durationMs = now() - startedAt;

    // An unparseable body is not classified here: a failing host answers its own
    // 504 and its 500 with an HTML page, and parsing first turned both into a
    // permanent ContractError that withRetry refuses to retry. Measured against
    // Booking Manager on 2026-08-20: `/offers` and `/yachts` return an HTML
    // `504 Gateway Time-out` under load, and a malformed bearer token returns a
    // 500 Tomcat page rather than the 401 the vendor's own client comment assumes.
    // The status is the reliable signal, so classification gets it first and only a
    // 2xx that failed to parse is a contract failure.
    let parsed: JsonValue = null;
    let parseFailure: unknown;
    let parseFailed = false;
    try {
      parsed = text.trim() === "" ? null : parseJson(text);
    } catch (cause) {
      parseFailed = true;
      parseFailure = cause;
    }

    const result = { body: parsed, httpStatus: response.status, durationMs, requestId };

    // Before classification: a retained error body is exactly what makes a
    // vendor dispute arguable. An HTML error page is retained too, as `null` here
    // with the text carried on the error's payload below.
    await onRawResponse?.({ endpoint, ...result });

    const error = classifyResponse(response.status, parsed, { endpoint });
    if (error) {
      throw error;
    }

    if (parseFailed) {
      // The status and the first line of the body are in the payload too, but only the
      // message survives into a log line or a rejected booking's cancel_reason, and
      // "not JSON" alone cannot distinguish a vendor 500 from a proxy's HTML error page.
      throw new ContractError(
        `Response from ${endpoint} was not JSON — HTTP ${response.status}, body starts: ${preview(text)}`,
        {
          endpoint,
          cause: parseFailure,
          payload: { httpStatus: response.status, bodyPreview: text.slice(0, 500) },
        },
      );
    }

    return result;
  }

  // Retry sits outside the queue slot and each attempt inside it: a sleeping
  // backoff must not hold the single sequential lane the vendor allows us.
  function send(
    method: string,
    endpoint: string,
    body: JsonRequestValue,
    hasBody: boolean,
    lane = queueKey,
    retry?: Partial<RetryPolicy>,
  ): Promise<ProviderHttpResult> {
    return withRetry(() => queue.run(lane, () => attempt(method, endpoint, body, hasBody)), {
      ...options.retry,
      ...retry,
    });
  }

  return {
    post(endpoint, body, requestOptions) {
      return send("POST", endpoint, body, true, requestOptions?.queueKey, requestOptions?.retry);
    },
    get(endpoint, query, requestOptions) {
      return send(
        "GET",
        `${endpoint}${query ? buildQueryString(query) : ""}`,
        null,
        false,
        requestOptions?.queueKey,
        requestOptions?.retry,
      );
    },
    del(endpoint) {
      return send("DELETE", endpoint, null, false);
    },
    put(endpoint, body) {
      return send("PUT", endpoint, body ?? null, body !== undefined);
    },
  };
}
