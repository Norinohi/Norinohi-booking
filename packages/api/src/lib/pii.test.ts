import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPiiCodec, InvalidCiphertextError, MissingEncryptionKeyError } from "./pii-codec";

const key = () => randomBytes(32).toString("base64");
const codec = createPiiCodec(key());

describe("createPiiCodec", () => {
  it("refuses to build without a key rather than defaulting to one", () => {
    expect(() => createPiiCodec(undefined)).toThrow(MissingEncryptionKeyError);
    expect(() => createPiiCodec("")).toThrow(MissingEncryptionKeyError);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => createPiiCodec(randomBytes(16).toString("base64"))).toThrow(/32 bytes, got 16/);
  });
});

describe("PII round-trip", () => {
  it("round-trips a passport number without storing it in the clear", () => {
    const stored = codec.encrypt("X1234567");

    expect(stored).not.toContain("X1234567");
    expect(codec.decrypt(stored)).toBe("X1234567");
  });

  it("round-trips non-ASCII, since names are not all Latin", () => {
    expect(codec.decrypt(codec.encrypt("Ольга Кошева"))).toBe("Ольга Кошева");
  });

  it("produces a different ciphertext every time", () => {
    // A deterministic ciphertext would leak that two travellers share a document.
    expect(codec.encrypt("X1234567")).not.toBe(codec.encrypt("X1234567"));
  });

  it("carries its version so a later key rotation can tell rows apart", () => {
    expect(codec.encrypt("X1234567").startsWith("v1:")).toBe(true);
  });
});

describe("PII failure modes", () => {
  it("refuses a tampered ciphertext rather than returning rubbish", () => {
    const [version, iv, tag, ciphertext] = codec.encrypt("X1234567").split(":");
    const flipped = Buffer.from(ciphertext ?? "", "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;

    expect(() => codec.decrypt([version, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("refuses a value that was never encrypted", () => {
    expect(() => codec.decrypt("X1234567")).toThrow(InvalidCiphertextError);
  });

  it("refuses a value encrypted under a different key", () => {
    const stored = createPiiCodec(key()).encrypt("X1234567");

    expect(() => codec.decrypt(stored)).toThrow();
  });

  it("keeps null columns null instead of encrypting the word", () => {
    expect(codec.encryptOptional(null)).toBeNull();
    expect(codec.encryptOptional(undefined)).toBeNull();
    expect(codec.encryptOptional("")).toBeNull();
    expect(codec.decryptOptional(null)).toBeNull();
  });
});
