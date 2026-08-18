import { z } from "zod";

/**
 * Provider-neutral error taxonomy. `errorType` intentionally mirrors the
 * `sync_error_type` pgEnum literals so a sync run can persist any failure.
 */
export type SyncErrorType = "rate_limited" | "transient" | "auth" | "not_found" | "contract";

export interface ProviderErrorOptions {
  /** The vendor's own code, e.g. NauSYS `"AUTHENTICATION_ERROR"`. */
  providerCode?: string;
  endpoint?: string;
  cause?: unknown;
  /** Attached request/response body. Always stored redacted. */
  payload?: unknown;
}

const SECRET_KEY_PATTERN = /password|username|credentials|secret|token|authorization/i;

const REDACTED = "[redacted]";

/**
 * Deep-clones `value`, replacing the value of any key that looks like a
 * credential. NauSYS sends plaintext username/password in every request body,
 * so anything we attach to an error or a log line has to pass through here.
 */
export function redactSecrets(value: unknown): unknown {
  return redactValue(value, new WeakSet());
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof Map || value instanceof Set) {
    return redactValue([...value], seen);
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactValue(item, seen);
  }
  return result;
}

/**
 * The persisted shape of a failure: what `sync_error` stores and what Sentry
 * receives. Named rather than an open dictionary so a new field has to be added
 * here before a call site can rely on reading it back.
 */
export interface SanitizedErrorContext {
  errorType: SyncErrorType;
  retryable: boolean;
  message: string;
  endpoint?: string;
  providerCode?: string;
  payload?: unknown;
  retryAfterMs?: number;
}

export abstract class ProviderError extends Error {
  abstract readonly errorType: SyncErrorType;
  abstract readonly retryable: boolean;

  readonly providerCode: string | undefined;
  readonly endpoint: string | undefined;
  readonly payload: unknown;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.providerCode = options.providerCode;
    this.endpoint = options.endpoint;
    this.payload = options.payload === undefined ? undefined : redactSecrets(options.payload);
  }

  /** Safe to persist in `sync_error` or ship to Sentry: carries no credentials. */
  sanitizedContext(): SanitizedErrorContext {
    const context: SanitizedErrorContext = {
      errorType: this.errorType,
      retryable: this.retryable,
      message: this.message,
    };
    if (this.endpoint !== undefined) {
      context.endpoint = this.endpoint;
    }
    if (this.providerCode !== undefined) {
      context.providerCode = this.providerCode;
    }
    if (this.payload !== undefined) {
      context.payload = this.payload;
    }
    return context;
  }
}

export interface RateLimitedErrorOptions extends ProviderErrorOptions {
  retryAfterMs?: number;
}

export class RateLimitedError extends ProviderError {
  readonly errorType = "rate_limited" as const;
  readonly retryable = true;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: RateLimitedErrorOptions = {}) {
    super(message, options);
    this.retryAfterMs = options.retryAfterMs;
  }

  override sanitizedContext(): SanitizedErrorContext {
    const context = super.sanitizedContext();
    if (this.retryAfterMs !== undefined) {
      context.retryAfterMs = this.retryAfterMs;
    }
    return context;
  }
}

export class TransientError extends ProviderError {
  readonly errorType = "transient" as const;
  readonly retryable = true;
}

export class AuthError extends ProviderError {
  readonly errorType = "auth" as const;
  readonly retryable = false;
}

export class NotFoundError extends ProviderError {
  readonly errorType = "not_found" as const;
  readonly retryable = false;
}

/** A payload we could not parse, or a value the canonical schema rejects. */
export class ContractError extends ProviderError {
  readonly errorType = "contract" as const;
  readonly retryable = false;
}

/** The requested period is no longer free. Retrying the same period cannot help. */
export class SlotUnavailableError extends ProviderError {
  readonly errorType = "not_found" as const;
  readonly retryable = false;
}

const NETWORK_ERROR_NAMES = new Set(["AbortError", "TimeoutError", "FetchError"]);

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const NETWORK_MESSAGE_PATTERN =
  /fetch failed|network|socket hang up|premature close|terminated|aborted|timed? ?out/i;

/**
 * The fields a thrown value has to carry before it can be classified. Anything
 * that fails this parse is not something we can call a network error, including
 * strings, numbers and null.
 */
const networkErrorCandidateSchema = z.object({
  name: z.string().optional().catch(undefined),
  message: z.string().optional().catch(undefined),
  code: z.string().optional().catch(undefined),
  cause: z.unknown().optional(),
});

function isNetworkError(err: unknown): boolean {
  const candidate = networkErrorCandidateSchema.safeParse(err);
  if (!candidate.success) {
    return false;
  }
  const { name, code, message, cause } = candidate.data;
  if (name !== undefined && NETWORK_ERROR_NAMES.has(name)) {
    return true;
  }
  if (code !== undefined && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }
  if (message !== undefined && NETWORK_MESSAGE_PATTERN.test(message)) {
    return true;
  }
  // undici wraps the real cause one level down ("fetch failed" -> ECONNREFUSED).
  return cause !== undefined && cause !== err && isNetworkError(cause);
}

/**
 * Total function over any thrown value. A `sync_error` insert must never itself
 * fail because a value could not be classified, so this swallows everything.
 */
export function toSyncErrorType(err: unknown): SyncErrorType {
  try {
    if (err instanceof ProviderError) {
      return err.errorType;
    }
    if (isNetworkError(err)) {
      return "transient";
    }
  } catch {
    return "contract";
  }
  return "contract";
}

/**
 * A one-line summary of why a response failed its schema — `id: expected number,
 * client.email: invalid email`.
 *
 * The issues are already attached to the ContractError's payload, but nothing on the
 * booking path prints a payload: the message is what reaches the log, the
 * `provider_reservation_event` row and the customer-facing error. Vendor contract drift
 * is only diagnosable if that message names the field, otherwise the only way to find
 * out which one moved is to reproduce the call against the live vendor.
 */
export function describeSchemaIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  limit = 5,
): string {
  const shown = issues
    .slice(0, limit)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join(", ");

  return issues.length > limit ? `${shown}, +${issues.length - limit} more` : shown;
}
