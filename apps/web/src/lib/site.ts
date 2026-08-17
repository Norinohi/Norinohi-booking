/**
 * The one origin allowed into search results. Staging and preview deployments serve the same
 * pages under their own host, so anything else is a duplicate and gets `noindex`.
 */
export const PRODUCTION_ORIGIN = "https://www.yachtskanner.com";

/** Imported by `next.config.ts` as well, so keep this module free of path aliases. */
export function isPublicSite(appUrl: string | undefined): boolean {
  if (!appUrl) return false;

  try {
    return new URL(appUrl).origin === PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}
