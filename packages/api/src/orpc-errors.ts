import { ORPCError } from "@orpc/server";

import { DomainError } from "./errors";

/**
 * The single translation from a service refusal to what goes on the wire.
 *
 * The message is passed through even when empty: `ORPCError` substitutes the default wording
 * for the code in that case, which is what the service got when it used to throw
 * `new ORPCError(code)` with no message.
 */
export function domainErrorToORPCError(error: DomainError) {
  return new ORPCError(error.kind, {
    message: error.message,
    data: error.data,
    cause: error,
  });
}
