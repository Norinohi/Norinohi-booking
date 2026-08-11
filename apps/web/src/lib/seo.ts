import { env } from "@yacht-charter/env/web";
import type { Metadata } from "next";

import { defaultLocale, type Locale, locales } from "@/i18n/config";

export const SITE_NAME = "YachtSkanner";

const DEFAULT_OG_IMAGE = "/seo/og-default.jpg";

/*
 * Open Graph asks for a territory-qualified locale (`en_US`), not the bare language code the
 * routes are keyed on. Most scrapers tolerate the short form; Facebook's linter does not.
 */
const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
  uk: "uk_UA",
};

function ogLocale(locale: string): string {
  return OG_LOCALES[locale as Locale] ?? locale;
}

/**
 * A 1200×630 social card cut from a Cloudinary asset.
 *
 * Mirrors `cloudinaryLoader` in `components/shared/data-display/image`: remote URLs go through
 * `fetch`, bare public IDs through `upload`. The crop is server-side on purpose — scrapers crop
 * to the declared ratio regardless, and doing it at the CDN keeps the boat centred instead of
 * letting Twitter guess.
 */
export function socialImage(src: string): string {
  const remote = /^https?:\/\//.test(src);
  const type = remote ? "fetch" : "upload";
  const asset = remote ? encodeURIComponent(src) : src;

  return `https://res.cloudinary.com/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/${type}/f_auto,q_auto,c_fill,w_1200,h_630/${asset}`;
}

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
      locale: ogLocale(locale),
      alternateLocale: locales.filter((other) => other !== locale).map(ogLocale),
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
