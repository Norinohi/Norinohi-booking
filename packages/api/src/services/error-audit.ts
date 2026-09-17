import { ORPCError } from "@orpc/server";
import { auditLog } from "@yacht-charter/db/schema/admin";
import { ProviderError, redactSecrets } from "@yacht-charter/providers/shared/errors";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { log, parseError, type ParsedError } from "evlog";
import { z } from "zod";

import type { Database } from "../context";
import type { auditErrorSourceSchema } from "../contracts/admin";
import { DomainError } from "../errors";
import type { ProviderOperation } from "../lib/provider-failure";
import { domainErrorToORPCError } from "../orpc-errors";

/*
 * Failures written to `audit_log` as `action = error`, beside the staff actions that succeeded.
 *
 * evlog and Sentry already hear about every one of these. This is the copy staff can read on the
 * audit screen without access to either, so it keeps what explains the failure and drops what
 * must not sit in a table: credentials, card data, bound SQL parameters and vendor payloads.
 */

export type ErrorAuditSource = z.infer<typeof auditErrorSourceSchema>;

export interface ErrorAuditEntry {
  source: ErrorAuditSource;
  /** The procedure path, job name, `provider.<operation>` or `stripe.<event type>`. */
  operation: string;
  thrown: ParsedError;
  actorUserId?: string | null;
  /** The row at stake (`booking`) when one is known, else what kind of operation failed. */
  entityType: string;
  entityId: string | null;
  /** The procedure input, job metrics or call subject. Redacted and capped before it is stored. */
  context?: unknown;
}

const jsonSchema = z.json();
type JsonValue = z.infer<typeof jsonSchema>;

export interface ErrorDescription {
  errorName: string;
  /** The transport kind, e.g. `CONFLICT`. Null for an error that never became one. */
  kind: string | null;
  /** `data.code` of a domain refusal, the vendor's code, or a driver code such as `ECONNREFUSED`. */
  code: string | null;
  status: number;
  message: string;
  /** Each cause below the thrown error, outermost first. */
  causes: string[];
  provider?: {
    errorType: string;
    providerCode: string | null;
    endpoint: string | null;
    retryable: boolean;
  };
}

export interface ErrorAuditMetadata extends ErrorDescription {
  source: ErrorAuditSource;
  operation: string;
  context: JsonValue | null;
}

export type ErrorAuditOutcome = "written" | "suppressed" | "failed";

const MESSAGE_LIMIT = 500;
const CONTEXT_LIMIT = 4_000;
const MAX_CAUSES = 5;

/* On top of `redactSecrets`, which is tuned for vendor request bodies. */
const EXTRA_SECRET_KEY = /api[-_]?key|card|cvc|cvv|iban|cookie|signature/i;
const REDACTED = "[redacted]";

const domainDataSchema = z.object({ code: z.string().min(1) });

/**
 * Writes one error row. Never throws, so a caller can await it in a `catch` and still rethrow
 * the original error untouched.
 *
 * Takes the base `Database` rather than a transaction: a failure usually rolls its own
 * transaction back, and the record of it must not go with it.
 *
 * Flood guard: nothing is written when a row with the same source, operation, code, entity and
 * actor landed in the last minute. A retrying job or a webhook Stripe redelivers leaves one row a
 * minute rather than one per attempt; evlog still receives every attempt.
 */
export async function recordErrorInAudit(
  db: Database,
  entry: ErrorAuditEntry,
): Promise<ErrorAuditOutcome> {
  try {
    const metadata: ErrorAuditMetadata = {
      source: entry.source,
      operation: entry.operation,
      ...describeThrown(entry.thrown),
      context: redactErrorContext(entry),
    };

    if (await recentlyRecorded(db, entry, metadata.code)) return "suppressed";

    await db.insert(auditLog).values({
      actorUserId: entry.actorUserId ?? null,
      action: "error",
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata,
    });
    return "written";
  } catch (cause) {
    log.error({
      action: "audit.error_write_failed",
      source: entry.source,
      operation: entry.operation,
      ...thrownFields(parseError(cause)),
    });
    return "failed";
  }
}

/** A vendor refusing a hold, confirm or release, recorded against the booking it was for. */
export function recordProviderFailure(
  db: Database,
  operation: ProviderOperation,
  thrown: ParsedError,
  subject: { bookingId: string; provider: string },
): Promise<ErrorAuditOutcome> {
  return recordErrorInAudit(db, {
    source: "provider",
    operation: `provider.${operation}`,
    thrown,
    entityType: "booking",
    entityId: subject.bookingId,
    context: { provider: subject.provider },
  });
}

async function recentlyRecorded(
  db: Database,
  entry: ErrorAuditEntry,
  code: string | null,
): Promise<boolean> {
  const [recent] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "error"),
        eq(auditLog.entityType, entry.entityType),
        entry.entityId === null ? isNull(auditLog.entityId) : eq(auditLog.entityId, entry.entityId),
        entry.actorUserId
          ? eq(auditLog.actorUserId, entry.actorUserId)
          : isNull(auditLog.actorUserId),
        sql`${auditLog.metadata}->>'source' = ${entry.source}`,
        sql`${auditLog.metadata}->>'operation' = ${entry.operation}`,
        code === null
          ? sql`${auditLog.metadata}->>'code' is null`
          : sql`${auditLog.metadata}->>'code' = ${code}`,
        gt(auditLog.createdAt, sql`now() - interval '1 minute'`),
      ),
    )
    .limit(1);

  return recent !== undefined;
}

/** What a thrown value says about itself, reduced to fields safe to store. */
export function describeThrown(thrown: ParsedError): ErrorDescription {
  const raw = thrown.raw;
  if (!(raw instanceof Error)) {
    return {
      errorName: "NonError",
      kind: null,
      code: thrown.code ?? null,
      status: 500,
      message: scrubMessage(thrown.message),
      causes: [],
    };
  }

  const chain = errorChain(raw);
  const vendor = chain.find((error): error is ProviderError => error instanceof ProviderError);
  /* An ORPCError built from a domain refusal is named after the transport, not the refusal. */
  const named = raw instanceof ORPCError && raw.cause instanceof Error ? raw.cause : raw;

  const description: ErrorDescription = {
    errorName: named.name,
    kind: null,
    code: vendor ? (vendor.providerCode ?? vendor.errorType) : (thrown.code ?? null),
    status: 500,
    message: scrubMessage(raw.message),
    causes: chain.slice(1).map((error) => `${error.name}: ${scrubMessage(error.message)}`),
  };

  if (raw instanceof ORPCError) {
    description.kind = raw.code;
    description.status = raw.status;
    description.code = domainDataSchema.safeParse(raw.data).data?.code ?? null;
  } else if (raw instanceof DomainError) {
    description.kind = raw.kind;
    description.status = domainErrorToORPCError(raw).status;
    description.code = raw.data?.code ?? null;
  }

  if (vendor) {
    description.provider = {
      errorType: vendor.errorType,
      providerCode: vendor.providerCode ?? null,
      endpoint: vendor.endpoint ?? null,
      retryable: vendor.retryable,
    };
  }

  return description;
}

/**
 * The context as JSON, with credentials and payment fields replaced and anything past a few
 * kilobytes cut to a preview. A value JSON cannot represent is stored as a marker rather than
 * failing the write.
 */
export function redactErrorContext(entry: Pick<ErrorAuditEntry, "context">): JsonValue | null {
  if (entry.context === undefined || entry.context === null) return null;

  let text: string | undefined;
  try {
    text = JSON.stringify(redactSecrets(entry.context), (key, value) =>
      EXTRA_SECRET_KEY.test(key) ? REDACTED : value,
    );
  } catch {
    return "[unserializable]";
  }
  if (text === undefined) return null;
  if (text.length > CONTEXT_LIMIT)
    return { truncated: true, preview: text.slice(0, CONTEXT_LIMIT) };

  return jsonSchema.parse(JSON.parse(text));
}

/**
 * Drizzle opens its message with the failed statement and every bound parameter, which can be a
 * guest's details or a token. The statement stays, the parameters go.
 */
export function scrubMessage(message: string): string {
  const cut = message.indexOf("\nparams:");
  const text = cut === -1 ? message : message.slice(0, cut);
  return text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}...` : text;
}

function errorChain(error: Error): Error[] {
  const chain: Error[] = [];
  let current: Error | undefined = error;
  while (current !== undefined && chain.length < MAX_CAUSES && !chain.includes(current)) {
    chain.push(current);
    current = current.cause instanceof Error ? current.cause : undefined;
  }
  return chain;
}
