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
  body: string;
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

export interface ProviderHttpClient {
  post(endpoint: string, body: unknown): Promise<ProviderHttpResult>;
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

  async function attempt(endpoint: string, body: unknown): Promise<ProviderHttpResult> {
    const requestId = newRequestId();
    const startedAt = now();

    let response: ProviderHttpResponseLike;
    let text: string;
    try {
      response = await fetchImpl(joinUrl(baseUrl, endpoint), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
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

  return {
    post(endpoint, body) {
      // Retry sits outside the queue slot and each attempt inside it: a sleeping
      // backoff must not hold the single sequential lane the vendor allows us.
      return withRetry(() => queue.run(queueKey, () => attempt(endpoint, body)), options.retry);
    },
  };
}
