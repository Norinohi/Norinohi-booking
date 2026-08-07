import type { Metadata } from "next";

import { defaultLocale, type Locale, locales } from "@/i18n/config";

export const SITE_NAME = "YachtCharter";

const DEFAULT_OG_IMAGE = "/seo/og-default.jpg";

export type SeoInput = {
  title: string;
  description: string;
  /** Locale-relative path, as written in a `<Link href>` — e.g. "/yachts". */
  path?: string;
  image?: string;
  noIndex?: boolean;
  locale?: Locale | string;
};

/** "/yachts" + "en" → "/en/yachts"; "/" + "en" → "/en". */
function localizePath(path: string, locale: string) {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/*
 * Every locale now has its own URL (docs/adr/0001), so each page declares a canonical under its
 * own prefix and lists the others as hreflang alternates. Emitting one shared canonical — as this
 * did while locale lived in a cookie — told search engines the three languages were one page.
 */
export function buildMetadata({
  title,
  description,
  path = "/",
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
  locale = defaultLocale,
}: SeoInput): Metadata {
  const canonical = localizePath(path, locale);

  const languages: Record<string, string> = Object.fromEntries(
    locales.map((alternate) => [alternate, localizePath(path, alternate)]),
  );
  languages["x-default"] = localizePath(path, defaultLocale);

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: noIndex ? { index: false, follow: false } : undefined,
  };
}
