/**
 * The one origin allowed into search results. Staging and preview deployments serve the same
 * pages under their own host, so anything else is a duplicate and gets `noindex`.
 *
 * This has to be the origin production actually answers on. It was left at the old
 * yachtskanner host after the move to charternavi, and the two gates below key off it: setting
 * `NEXT_PUBLIC_APP_URL` to the new domain corrected the sitemap and, in the same move, made
 * `isPublicSite` false everywhere - so production served `X-Robots-Tag: noindex, nofollow` on
 * every page and robots.txt stopped naming a sitemap at all. Changing the domain again means
 * changing this line with it.
 */
export const PRODUCTION_ORIGIN = "https://www.charternavi.com";

/** Imported by `next.config.ts` as well, so keep this module free of path aliases. */
export function isPublicSite(appUrl: string | undefined): boolean {
  if (!appUrl) return false;

  try {
    return new URL(appUrl).origin === PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}
