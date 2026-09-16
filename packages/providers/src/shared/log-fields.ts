import type { ParsedError } from "evlog";

import { describeErrorChain } from "./error-chain";
import { ProviderError } from "./errors";

/**
 * A thrown value as flat fields on an evlog event.
 *
 * Flat because a nested object reaches the drain as a blob nothing can filter or alert on.
 * Taken as evlog's own `parseError` result rather than the raw `catch` binding, so the one
 * parse of an unknown thrown value happens at that boundary and not here.
 *
 * A `ProviderError` contributes only what `sanitizedContext` allows, which never includes the
 * request body: NauSYS sends credentials in every one.
 */
export interface ThrownFields {
  error: string;
  errorName?: string;
  errorType?: string;
  providerCode?: string;
  endpoint?: string;
  stack?: string;
}

export function thrownFields(thrown: ParsedError): ThrownFields {
  const raw = thrown.raw;
  if (!(raw instanceof Error)) return { error: thrown.message };

  const fields: ThrownFields = {
    error: describeErrorChain(raw),
    errorName: raw.name,
    stack: raw.stack,
  };
  if (raw instanceof ProviderError) {
    const context = raw.sanitizedContext();
    fields.errorType = context.errorType;
    fields.providerCode = context.providerCode;
    fields.endpoint = context.endpoint;
  }
  return fields;
}
