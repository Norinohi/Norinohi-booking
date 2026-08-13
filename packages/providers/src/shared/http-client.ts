import { randomUUID } from "node:crypto";

import {
  AuthError,
  ContractError,
  NotFoundError,
  type ProviderError,
  RateLimitedError,
  TransientError,
} from "./errors";
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
  body: unknown;
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
  body: unknown,
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
  fetchImpl?: FetchLike;
  now?: () => number;
  newRequestId?: () => string;
}

export type QueryValue = string | number | boolean | Array<string | number>;

export interface ProviderHttpClient {
  post(endpoint: string, body: unknown): Promise<ProviderHttpResult>;
  /** Booking Manager serves every read as GET with query parameters. */
  get(
    endpoint: string,
    query?: Record<string, QueryValue | undefined>,
  ): Promise<ProviderHttpResult>;
  del(endpoint: string): Promise<ProviderHttpResult>;
  put(endpoint: string, body?: unknown): Promise<ProviderHttpResult>;
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

export function createProviderHttpClient(options: ProviderHttpClientOptions): ProviderHttpClient {
  const {
    baseUrl,
    queueKey,
    timeoutMs = 30_000,
    queue = sharedQueue,
    classifyResponse = httpStatusClassifier,
    onRawResponse,
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
    body: unknown,
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

    let parsed: unknown;
    try {
      parsed = text.trim() === "" ? null : JSON.parse(text);
    } catch (cause) {
      throw new ContractError(`Response from ${endpoint} was not JSON`, {
        endpoint,
        cause,
        payload: { httpStatus: response.status, bodyPreview: text.slice(0, 500) },
      });
    }

    const result = { body: parsed, httpStatus: response.status, durationMs, requestId };

    // Before classification: a retained error body is exactly what makes a
    // vendor dispute arguable.
    await onRawResponse?.({ endpoint, ...result });

    const error = classifyResponse(response.status, parsed, { endpoint });
    if (error) {
      throw error;
    }
    return result;
  }

  // Retry sits outside the queue slot and each attempt inside it: a sleeping
  // backoff must not hold the single sequential lane the vendor allows us.
  function send(
    method: string,
    endpoint: string,
    body: unknown,
    hasBody: boolean,
  ): Promise<ProviderHttpResult> {
    return withRetry(
      () => queue.run(queueKey, () => attempt(method, endpoint, body, hasBody)),
      options.retry,
    );
  }

  return {
    post(endpoint, body) {
      return send("POST", endpoint, body, true);
    },
    get(endpoint, query) {
      return send("GET", `${endpoint}${query ? buildQueryString(query) : ""}`, undefined, false);
    },
    del(endpoint) {
      return send("DELETE", endpoint, undefined, false);
    },
    put(endpoint, body) {
      return send("PUT", endpoint, body, body !== undefined);
    },
  };
}
