import { ORPCError } from "@orpc/server";
import { env } from "@yacht-charter/env/server";

import { createPiiCodec, MissingEncryptionKeyError, type PiiCodec } from "./pii-codec";

/**
 * The env-bound half of PII encryption: `pii-codec.ts` does the cryptography, this
 * decides where the key comes from and how a missing one surfaces to a caller.
 *
 * Built on first use rather than at import so a server without `ENCRYPTION_KEY`
 * still boots and serves everything that is not traveller data, the same way it
 * boots without Stripe or NauSYS credentials.
 */
let codec: PiiCodec | null = null;

function piiCodec(): PiiCodec {
  if (codec) return codec;

  try {
    codec = createPiiCodec(env.ENCRYPTION_KEY);
    return codec;
  } catch (error) {
    if (error instanceof MissingEncryptionKeyError) {
      throw new ORPCError("NOT_IMPLEMENTED", {
        message: `Traveller details are unavailable: ${error.message}`,
      });
    }
    throw error;
  }
}

export const encryptPii = (plaintext: string): string => piiCodec().encrypt(plaintext);

export const encryptOptionalPii = (value: string | null | undefined): string | null =>
  piiCodec().encryptOptional(value);

export function decryptOptionalPii(value: string | null): string | null {
  try {
    return piiCodec().decryptOptional(value);
  } catch (error) {
    // A missing key already surfaced as NOT_IMPLEMENTED above; anything else here
    // is a row we cannot read — a rotated key, a restored backup — which the
    // caller cannot fix by asking differently.
    if (error instanceof ORPCError) throw error;
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Stored traveller details could not be decrypted",
    });
  }
}
