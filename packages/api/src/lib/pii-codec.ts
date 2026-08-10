import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * Authenticated encryption for PII at rest (architecture §10). AES-256-GCM rather
 * than a plain block mode because the tag makes a tampered ciphertext fail loudly
 * instead of decrypting to rubbish, and a passport number that silently changed is
 * worse than one that cannot be read.
 *
 * Values are stored as `v1:<iv>:<tag>:<ciphertext>`, all base64. The version
 * prefix is what makes a future key rotation possible: a `v2` reader can tell at a
 * glance which key produced a row rather than guessing by length.
 *
 * Deliberately env-free so it can be tested as the pure function it is; the key
 * comes from `pii.ts`, which owns the environment.
 */

const VERSION = "v1";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const KEY_BYTES = 32;

export class MissingEncryptionKeyError extends Error {}
export class InvalidCiphertextError extends Error {}

export interface PiiCodec {
  encrypt(plaintext: string): string;
  decrypt(stored: string): string;
  /** Nullable columns round-trip as null rather than as the string "null". */
  encryptOptional(value: string | null | undefined): string | null;
  decryptOptional(value: string | null): string | null;
}

export function createPiiCodec(keyBase64: string | undefined): PiiCodec {
  // Refused rather than defaulted: a fallback key would write passport numbers
  // that look encrypted and are not.
  if (!keyBase64) {
    throw new MissingEncryptionKeyError("ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new MissingEncryptionKeyError(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  const codec: PiiCodec = {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

      return [
        VERSION,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        ciphertext.toString("base64"),
      ].join(":");
    },

    decrypt(stored) {
      const [version, iv, tag, ciphertext] = stored.split(":");

      if (version !== VERSION || !iv || !tag || !ciphertext) {
        throw new InvalidCiphertextError("Stored value is not in the expected encrypted format");
      }

      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));

      // Throws on a wrong key or a tampered value, which is the point of GCM.
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },

    encryptOptional: (value) => (value ? codec.encrypt(value) : null),
    decryptOptional: (value) => (value === null ? null : codec.decrypt(value)),
  };

  return codec;
}
