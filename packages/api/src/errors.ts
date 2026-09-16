/**
 * Refusals a service raises without knowing it is being called over HTTP.
 *
 * Services throw these; `src/orpc-errors.ts` is the one place that turns them into an
 * `ORPCError`, so a cron job, the Stripe webhook or a future agent tool can call a service
 * without pulling in the transport. Each kind is an oRPC error code, spelled the same, because
 * the web app reads `code`, `status`, `message` and `data.code` off the wire and none of that
 * may change.
 */
export type DomainErrorKind =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "INTERNAL_SERVER_ERROR"
  | "NOT_IMPLEMENTED"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE";

/** What a refusal carries for a client to branch on. Serialized to the wire as `data`. */
export interface DomainErrorData {
  /** The specific refusal, e.g. `QUOTE_EXPIRED`, where the kind alone is too coarse. */
  code: string;
  quoteId?: string;
  extras?: string[];
}

export interface DomainErrorOptions extends ErrorOptions {
  /** Omitted means the transport's default wording for the kind. */
  message?: string;
  data?: DomainErrorData;
}

export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly data: DomainErrorData | undefined;

  constructor(kind: DomainErrorKind, options: DomainErrorOptions = {}) {
    super(options.message, options);
    this.name = "DomainError";
    this.kind = kind;
    this.data = options.data;
  }
}

export class BadRequestError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("BAD_REQUEST", options);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("UNAUTHORIZED", options);
  }
}

export class ForbiddenError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("FORBIDDEN", options);
  }
}

export class NotFoundError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("NOT_FOUND", options);
  }
}

export class ConflictError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("CONFLICT", options);
  }
}

export class PreconditionFailedError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("PRECONDITION_FAILED", options);
  }
}

export class InternalError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("INTERNAL_SERVER_ERROR", options);
  }
}

/** A feature switched off by missing configuration, such as an unset Stripe or encryption key. */
export class NotImplementedError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("NOT_IMPLEMENTED", options);
  }
}

export class BadGatewayError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("BAD_GATEWAY", options);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(options?: DomainErrorOptions) {
    super("SERVICE_UNAVAILABLE", options);
  }
}
