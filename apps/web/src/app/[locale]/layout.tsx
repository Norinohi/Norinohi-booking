import { GoogleAnalytics } from "@next/third-parties/google";
import { env } from "@yacht-charter/env/web";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import Script from "next/script";

import "../../index.css";
import Footer from "@/components/layout/footer";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { FooterGate } from "@/components/layout/footer-gate";
import NavigationBar from "@/components/layout/navigation-bar";
import Providers from "@/components/layout/providers";
import QueryErrorLabels from "@/components/layout/query-error-labels";
import { routing } from "@/i18n/routing";
import { CONSENT_BOOTSTRAP } from "@/lib/consent";
import { getCopyrightYear } from "@/lib/copyright-year";
import { buildMetadata, SITE_NAME } from "@/lib/seo";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

type LocaleParams = { params: Promise<{ locale: string }> };

/*
 * Enumerating the locales is what makes this layout prerenderable: without it every route below
 * would be a fallback route and `params` would defer to request time. See docs/adr/0001.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Layout" });
  const title = t("title");

  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    ...buildMetadata({ title, description: t("description"), locale }),
    title: { default: title, template: `%s | ${SITE_NAME}` },
  };
}

/*
 * Split from `generateMetadata` because Next requires it: `themeColor` moved to the `viewport`
 * export and warns at build time if it is left in metadata. Both entries are needed — a single
 * value would paint the light chrome behind a dark-mode page.
 *
 * The two colours are `--background` resolved per scheme: `--base-white` and `--natural-900`.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode }> & LocaleParams) {
  const { locale } = await params;

  // An unknown prefix (`/fr/...`) reaches here only if the middleware let it through; 404 rather
  // than silently falling back, so bad locales never render as the default one.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Must precede any next-intl call in the subtree — it is what lets those calls resolve from the
  // known segment instead of a request-time lookup.
  setRequestLocale(locale);

  // Cached, so awaiting it here does not make the layout blocking. See lib/copyright-year.
  const year = await getCopyrightYear();

  // Unset outside production on purpose: staging traffic in the client's reports cannot be
  // separated out afterwards. No id means no tag and no banner — see packages/env/src/web.ts.
  const gaId = env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang={locale} className="light motion-safe:scroll-smooth" data-scroll-behavior="smooth">
      <body className={`${manrope.variable} antialiased`}>
        {/* Order is load-bearing: this declares the denied default before `gtag.js` runs, so the
            tag cannot write a cookie ahead of an answer. `beforeInteractive` puts it in the initial
            HTML, ahead of every Next module and of the afterInteractive tag below.

            It sits inside <body> because that is where the docs put it and where HTML allows it —
            as a sibling of <body> React renders a script directly under <html>, which is invalid
            and throws three hydration errors in the dev overlay. */}
        {gaId ? (
          <Script id="consent-bootstrap" strategy="beforeInteractive">
            {CONSENT_BOOTSTRAP}
          </Script>
        ) : null}
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <NextIntlClientProvider>
          <Providers>
            <QueryErrorLabels />
            {/* Before the page content, not after: the banner is `fixed`, so DOM order costs it
                nothing visually, and placing it last put its buttons 40-odd tab stops into the
                page. Consent has to be reachable, not buried. */}
            {gaId ? <CookieConsent /> : null}
            <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-x-clip">
              <NavigationBar />
              {children}
              <FooterGate>
                <Footer year={year} />
              </FooterGate>
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
