import { providerMediaAsset } from "@yacht-charter/db/schema/listing";
import { provider as providerTable, syncError, syncRun } from "@yacht-charter/db/schema/provider";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { Database } from "../registry";
import type { ProviderKey } from "../types";
import { chunked, ROW_CHUNK } from "../shared/chunks";
import { describeErrorChain } from "../shared/error-chain";
import { openSyncRun, releaseSyncRun } from "./run";

export interface MediaAssetRef {
  id: string;
  originalUrl: string;
  bunnyStoragePath: string;
  cdnUrl: string;
  status: (typeof providerMediaAsset.$inferSelect)["status"];
}

export interface SyncMediaAssetsOptions {
  db: Database;
  providerId: string;
  providerKey: ProviderKey;
  mediaUrls: readonly string[];
  now: Date;
}

export interface CleanupProviderMediaOptions {
  db: Database;
  providerId: string;
  now?: Date;
}

export interface ProviderMediaCleanupSummary {
  providers: number;
  deleted: number;
  failed: number;
  skipped: number;
}

interface BunnyMediaClient {
  readonly concurrency: number;
  readonly cleanupGraceDays: number;
  cdnUrl(path: string): string;
  uploadFromUrl(input: { sourceUrl: string; storagePath: string }): Promise<UploadedMedia>;
  delete(path: string): Promise<void>;
}

interface UploadedMedia {
  contentType: string | null;
  byteSize: number;
}

interface BunnyMediaConfig {
  storageHost: string;
  storageZoneName: string;
  storageAccessKey: string;
  cdnBaseUrl: string;
  concurrency: number;
  downloadTimeoutMs: number;
  cleanupGraceDays: number;
}

const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);

export async function syncMediaAssets(
  options: SyncMediaAssetsOptions,
): Promise<Map<string, MediaAssetRef>> {
  const client = await createBunnyMediaClient();
  if (!client) return new Map();

  const urls = uniqueUrls(options.mediaUrls);
  if (urls.length === 0) return new Map();

  const hashes = new Map(urls.map((url) => [url, hashUrl(url)]));
  await upsertPendingAssets(options, client, hashes);

  const assets = await loadAssetsByHash(options.db, options.providerId, [...hashes.values()]);
  const byUrl = new Map<string, MediaAssetRef>();
  const pendingUpload: MediaAssetRef[] = [];

  for (const url of urls) {
    const asset = assets.get(hashes.get(url) ?? "");
    if (!asset) continue;

    const ref = toMediaAssetRef(client, asset);
    byUrl.set(url, ref);
    if (asset.status === "pending" || asset.status === "failed" || asset.status === "deleted") {
      pendingUpload.push(ref);
    }
  }

  await uploadAssets(options.db, client, pendingUpload, options.now);
  await markMissingAssetsInactive(options);

  return byUrl;
}

export async function cleanupProviderMediaAssets(
  options: CleanupProviderMediaOptions,
): Promise<{ deleted: number; failed: number; skipped: number }> {
  const client = await createBunnyMediaClient();
  if (!client) return { deleted: 0, failed: 0, skipped: 0 };

  const now = options.now ?? new Date();
  const graceMs = client.cleanupGraceDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - graceMs);

  const rows = await options.db
    .select({
      id: providerMediaAsset.id,
      bunnyStoragePath: providerMediaAsset.bunnyStoragePath,
    })
    .from(providerMediaAsset)
    .where(
      and(
        eq(providerMediaAsset.providerId, options.providerId),
        eq(providerMediaAsset.status, "inactive"),
        lt(providerMediaAsset.inactiveAt, cutoff),
        isNull(providerMediaAsset.deletedAt),
      ),
    );

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await client.delete(row.bunnyStoragePath);
      await options.db
        .update(providerMediaAsset)
        .set({ status: "deleted", deletedAt: now, updatedAt: now, lastUploadError: null })
        .where(eq(providerMediaAsset.id, row.id));
      deleted += 1;
    } catch (error) {
      const message = error instanceof Error ? describeErrorChain(error) : String(error);
      failed += 1;
      await options.db
        .update(providerMediaAsset)
        .set({ lastUploadError: message.slice(0, 2000), updatedAt: now })
        .where(eq(providerMediaAsset.id, row.id));
    }
  }

  return { deleted, failed, skipped: 0 };
}

export async function cleanupEnabledProviderMediaAssets(
  db: Database,
): Promise<ProviderMediaCleanupSummary> {
  const providers = await db
    .select({ id: providerTable.id, code: providerTable.code })
    .from(providerTable)
    .where(eq(providerTable.enabled, true));

  let failed = 0;
  let skipped = 0;
  let deleted = 0;

  for (const provider of providers.filter((row) => row.code !== "mock")) {
    let syncRunId: string;
    try {
      syncRunId = await openSyncRun(db, provider.id, "media");
    } catch (error) {
      const message = error instanceof Error ? describeErrorChain(error) : String(error);
      skipped += 1;
      console.warn(`Skipped media cleanup for "${provider.code}": ${message}`);
      continue;
    }

    const startedAt = new Date();
    try {
      const result = await cleanupProviderMediaAssets({ db, providerId: provider.id });
      deleted += result.deleted;
      failed += result.failed;
      await closeMediaRun(db, syncRunId, {
        status: result.failed > 0 ? "partial" : "success",
        startedAt,
        updatedCount: result.deleted,
        failedCount: result.failed,
        skippedCount: result.skipped,
      });
    } catch (error) {
      const message = error instanceof Error ? describeErrorChain(error) : String(error);
      failed += 1;
      await closeMediaRun(db, syncRunId, {
        status: "failed",
        startedAt,
        updatedCount: 0,
        failedCount: 1,
        skippedCount: 0,
      });
      await db.insert(syncError).values({
        syncRunId,
        errorType: "transient",
        message: message.slice(0, 2000),
        context: { provider: provider.code },
      });
      console.error(`Media cleanup failed for "${provider.code}":`, error);
    } finally {
      releaseSyncRun(syncRunId);
    }
  }

  return { providers: providers.length, deleted, failed, skipped };
}

async function createBunnyMediaClient(): Promise<BunnyMediaClient | null> {
  const { env } = await import("@yacht-charter/env/server");
  if (!env.BUNNY_MEDIA_SYNC_ENABLED) return null;
  if (!env.BUNNY_STORAGE_ZONE_NAME || !env.BUNNY_STORAGE_ACCESS_KEY || !env.BUNNY_CDN_BASE_URL) {
    throw new Error(
      "Bunny media sync is enabled but BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_ACCESS_KEY, or BUNNY_CDN_BASE_URL is missing",
    );
  }

  return new HttpBunnyMediaClient({
    storageHost: env.BUNNY_STORAGE_HOST,
    storageZoneName: env.BUNNY_STORAGE_ZONE_NAME,
    storageAccessKey: env.BUNNY_STORAGE_ACCESS_KEY,
    cdnBaseUrl: env.BUNNY_CDN_BASE_URL,
    concurrency: env.BUNNY_MEDIA_SYNC_CONCURRENCY,
    downloadTimeoutMs: env.BUNNY_MEDIA_DOWNLOAD_TIMEOUT_MS,
    cleanupGraceDays: env.BUNNY_MEDIA_CLEANUP_GRACE_DAYS,
  });
}

export function providerMediaUrlHash(url: string): string {
  return hashUrl(url);
}

export function providerMediaStoragePath(providerKey: ProviderKey, url: string): string {
  return storagePath(providerKey, hashUrl(url), url);
}

class HttpBunnyMediaClient implements BunnyMediaClient {
  constructor(private readonly config: BunnyMediaConfig) {}

  get concurrency(): number {
    return this.config.concurrency;
  }

  get cleanupGraceDays(): number {
    return this.config.cleanupGraceDays;
  }

  cdnUrl(path: string): string {
    return `${this.config.cdnBaseUrl.replace(/\/+$/, "")}/${encodePath(path)}`;
  }

  async uploadFromUrl(input: { sourceUrl: string; storagePath: string }): Promise<UploadedMedia> {
    const source = await fetchWithTimeout(input.sourceUrl, this.config.downloadTimeoutMs);
    if (!source.ok) throw new Error(`media download failed with ${source.status}`);

    const contentType = source.headers.get("content-type");
    const body = new Uint8Array(await source.arrayBuffer());
    if (body.byteLength === 0) throw new Error("media download returned an empty body");

    const upload = await fetch(this.storageUrl(input.storagePath), {
      method: "PUT",
      headers: {
        AccessKey: this.config.storageAccessKey,
        "Content-Type": contentType ?? "application/octet-stream",
      },
      body,
    });
    if (!upload.ok) throw new Error(`bunny upload failed with ${upload.status}`);

    return { contentType, byteSize: body.byteLength };
  }

  async delete(path: string): Promise<void> {
    const response = await fetch(this.storageUrl(path), {
      method: "DELETE",
      headers: { AccessKey: this.config.storageAccessKey },
    });
    if (response.ok || response.status === 404) return;
    throw new Error(`bunny delete failed with ${response.status}`);
  }

  private storageUrl(path: string): string {
    return `${this.config.storageHost.replace(/\/+$/, "")}/${this.config.storageZoneName}/${encodePath(path)}`;
  }
}

async function upsertPendingAssets(
  options: SyncMediaAssetsOptions,
  client: BunnyMediaClient,
  hashes: ReadonlyMap<string, string>,
): Promise<void> {
  const values = [...hashes].map(([url, hash]) => ({
    providerId: options.providerId,
    originalUrl: url,
    originalUrlHash: hash,
    bunnyStoragePath: providerMediaStoragePath(options.providerKey, url),
    bunnyCdnUrl: client.cdnUrl(providerMediaStoragePath(options.providerKey, url)),
    status: "pending" as const,
    lastSeenAt: options.now,
    inactiveAt: null,
    deletedAt: null,
  }));

  for (const chunk of chunked(values, ROW_CHUNK)) {
    await options.db
      .insert(providerMediaAsset)
      .values(chunk)
      .onConflictDoUpdate({
        target: [providerMediaAsset.providerId, providerMediaAsset.originalUrlHash],
        set: {
          originalUrl: sql`excluded.original_url`,
          bunnyCdnUrl: sql`excluded.bunny_cdn_url`,
          lastSeenAt: sql`excluded.last_seen_at`,
          inactiveAt: null,
          deletedAt: null,
          status: sql`case
            when ${providerMediaAsset.status} = 'deleted' then 'pending'
            when ${providerMediaAsset.status} = 'inactive' then 'uploaded'
            else ${providerMediaAsset.status}
          end`,
          updatedAt: options.now,
        },
      });
  }
}

async function loadAssetsByHash(db: Database, providerId: string, hashes: readonly string[]) {
  const assets = new Map<
    string,
    {
      id: string;
      originalUrl: string;
      originalUrlHash: string;
      bunnyStoragePath: string;
      status: (typeof providerMediaAsset.$inferSelect)["status"];
    }
  >();

  for (const chunk of chunked(hashes, ROW_CHUNK)) {
    const rows = await db
      .select({
        id: providerMediaAsset.id,
        originalUrl: providerMediaAsset.originalUrl,
        originalUrlHash: providerMediaAsset.originalUrlHash,
        bunnyStoragePath: providerMediaAsset.bunnyStoragePath,
        status: providerMediaAsset.status,
      })
      .from(providerMediaAsset)
      .where(
        and(
          eq(providerMediaAsset.providerId, providerId),
          inArray(providerMediaAsset.originalUrlHash, chunk),
        ),
      );
    for (const row of rows) {
      assets.set(row.originalUrlHash, row);
    }
  }

  return assets;
}

async function uploadAssets(
  db: Database,
  client: BunnyMediaClient,
  assets: readonly MediaAssetRef[],
  now: Date,
): Promise<void> {
  const workers = Array.from({ length: client.concurrency }, async (_, index) => {
    for (let cursor = index; cursor < assets.length; cursor += client.concurrency) {
      const asset = assets[cursor];
      if (asset) await uploadAsset(db, client, asset, now);
    }
  });
  await Promise.all(workers);
}

async function uploadAsset(
  db: Database,
  client: BunnyMediaClient,
  asset: MediaAssetRef,
  now: Date,
): Promise<void> {
  try {
    const uploaded = await client.uploadFromUrl({
      sourceUrl: asset.originalUrl,
      storagePath: asset.bunnyStoragePath,
    });
    await db
      .update(providerMediaAsset)
      .set({
        status: "uploaded",
        contentType: uploaded.contentType,
        byteSize: uploaded.byteSize,
        lastUploadError: null,
        uploadAttempts: sql`${providerMediaAsset.uploadAttempts} + 1`,
        updatedAt: now,
      })
      .where(eq(providerMediaAsset.id, asset.id));
    asset.status = "uploaded";
  } catch (error) {
    const message = error instanceof Error ? describeErrorChain(error) : String(error);
    await db
      .update(providerMediaAsset)
      .set({
        status: "failed",
        lastUploadError: message.slice(0, 2000),
        uploadAttempts: sql`${providerMediaAsset.uploadAttempts} + 1`,
        updatedAt: now,
      })
      .where(eq(providerMediaAsset.id, asset.id));
    asset.status = "failed";
  }
}

async function markMissingAssetsInactive(options: SyncMediaAssetsOptions): Promise<void> {
  await options.db
    .update(providerMediaAsset)
    .set({ status: "inactive", inactiveAt: options.now, updatedAt: options.now })
    .where(
      and(
        eq(providerMediaAsset.providerId, options.providerId),
        inArray(providerMediaAsset.status, ["pending", "uploaded", "failed"]),
        lt(providerMediaAsset.lastSeenAt, options.now),
      ),
    );
}

function toMediaAssetRef(
  client: BunnyMediaClient,
  asset: {
    id: string;
    originalUrl: string;
    bunnyStoragePath: string;
    status: (typeof providerMediaAsset.$inferSelect)["status"];
  },
): MediaAssetRef {
  return {
    id: asset.id,
    originalUrl: asset.originalUrl,
    bunnyStoragePath: asset.bunnyStoragePath,
    cdnUrl: client.cdnUrl(asset.bunnyStoragePath),
    status: asset.status,
  };
}

function uniqueUrls(urls: readonly string[]): string[] {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

function storagePath(providerKey: ProviderKey, hash: string, url: string): string {
  return `${providerKey}/${hash}.${extensionFor(url)}`;
}

function extensionFor(url: string): string {
  const pathname = safePathname(url);
  const extension = pathname.split(".").pop()?.toLowerCase();
  if (extension && IMAGE_EXTENSIONS.has(extension)) return extension === "jpeg" ? "jpg" : extension;
  return "jpg";
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function closeMediaRun(
  db: Database,
  syncRunId: string,
  input: {
    status: (typeof syncRun.$inferInsert)["status"];
    startedAt: Date;
    updatedCount: number;
    failedCount: number;
    skippedCount: number;
  },
): Promise<void> {
  await db
    .update(syncRun)
    .set({
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: new Date(),
      updatedCount: input.updatedCount,
      failedCount: input.failedCount,
      skippedCount: input.skippedCount,
    })
    .where(eq(syncRun.id, syncRunId));
}
