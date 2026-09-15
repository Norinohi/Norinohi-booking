import { createHash } from "node:crypto";

import { env } from "@yacht-charter/env/server";

const EXTENSION_BY_TYPE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

/** Whether this environment can store an uploaded image at all. */
export function editorialImageUploadEnabled(): boolean {
  return Boolean(
    env.BUNNY_STORAGE_ZONE_NAME && env.BUNNY_STORAGE_ACCESS_KEY && env.BUNNY_CDN_BASE_URL,
  );
}

/**
 * Stores an image an editor uploaded and answers the CDN URL it is served from.
 *
 * The same Bunny storage zone the provider photos sync into, under `editorial/`, so the web app's
 * image loader resizes it like any other catalogue photo. Not gated on `BUNNY_MEDIA_SYNC_ENABLED`:
 * that switch is about copying vendor photos in bulk, not about whether storage exists.
 *
 * Named by content hash, so uploading the same file twice stores it once and a replaced image gets
 * a new URL rather than one a CDN edge may still hold the old bytes under.
 */
export async function uploadEditorialImage(input: {
  folder: string;
  body: ArrayBuffer;
  contentType: string;
}): Promise<string> {
  const zone = env.BUNNY_STORAGE_ZONE_NAME;
  const key = env.BUNNY_STORAGE_ACCESS_KEY;
  const cdn = env.BUNNY_CDN_BASE_URL;
  if (!zone || !key || !cdn) throw new Error("Bunny storage is not configured");

  const extension = EXTENSION_BY_TYPE.get(input.contentType);
  if (!extension) throw new Error(`Unsupported image type ${input.contentType}`);

  const hash = createHash("sha256").update(new Uint8Array(input.body)).digest("hex").slice(0, 32);
  const path = `editorial/${encodeURIComponent(input.folder)}/${hash}.${extension}`;

  const response = await fetch(`${env.BUNNY_STORAGE_HOST.replace(/\/+$/, "")}/${zone}/${path}`, {
    method: "PUT",
    headers: { AccessKey: key, "Content-Type": input.contentType },
    body: input.body,
  });
  if (!response.ok) throw new Error(`Bunny upload failed with ${response.status}`);

  return `${cdn.replace(/\/+$/, "")}/${path}`;
}
