import { env } from "@yacht-charter/env/server";

/**
 * Tells the web app to drop its cached catalog reads.
 *
 * The sync writes the catalog and the web app caches it, so the two only meet
 * over HTTP. docs/adr/0002 shipped without this on the reasoning that the windows
 * (`days` for facets, `hours` for cards and detail) would catch up on their own,
 * which held while nobody was watching a sync land. It stops holding the moment
 * an operator triggers an import and goes looking for the boats.
 *
 * Deliberately best-effort. A sync that wrote 108 listings has done its job; if
 * the web app is redeploying, unreachable, or has no secret configured, the worst
 * case is the old behaviour, which is a stale window rather than a lost import.
 * So this never throws and never blocks the run.
 */
const CATALOG_TAG = "catalog";
const TIMEOUT_MS = 5_000;

export interface RevalidateResult {
  attempted: boolean;
  ok: boolean;
  reason?: string;
}

export async function revalidateCatalogCache(
  tags: string[] = [CATALOG_TAG],
): Promise<RevalidateResult> {
  const secret = env.REVALIDATE_SECRET;
  if (!secret) {
    return { attempted: false, ok: false, reason: "REVALIDATE_SECRET is not set" };
  }

  // CORS_ORIGIN is already defined as the web app's origin and has to agree with
  // it for auth to work at all, so it is the one URL guaranteed to be correct
  // rather than a second knob that can drift out of sync with the first.
  const url = new URL("/api/revalidate", env.CORS_ORIGIN);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { attempted: true, ok: false, reason: `HTTP ${response.status}` };
    }
    return { attempted: true, ok: true };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      reason: error instanceof Error ? error.message : "unknown error",
    };
  }
}
