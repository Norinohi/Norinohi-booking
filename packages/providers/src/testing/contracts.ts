import { ProviderError } from "../shared/errors";

import type { JsonField } from "../shared/json";

/**
 * A value the callee's signature forbids.
 *
 * Every adapter entry point still guards its inputs at runtime, because vendors
 * send null where their own schema promised a string and JavaScript callers reach
 * these functions with no types at all. Those guards need a test, and a test for
 * them has to pass something the compiler would otherwise refuse.
 */
export function contractViolation<T>(value: JsonField): T {
  // SAFETY: deliberately ill-typed. Every call site is a test asserting that the
  // callee rejects this value at runtime rather than acting on it.
  return value as T;
}

/**
 * The provider error a call rejected with, so a test can read its fields without
 * narrowing an `unknown` at every assertion.
 */
export async function providerRejection(call: Promise<unknown>): Promise<ProviderError> {
  try {
    await call;
  } catch (thrown) {
    if (thrown instanceof ProviderError) return thrown;
    throw thrown;
  }
  throw new Error("the call resolved where the test expected a provider error");
}
