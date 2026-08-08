import { env } from "@yacht-charter/env/web";
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";

import "../../index.css";
import Footer from "@/components/layout/footer";
import NavigationBar from "@/components/layout/navigation-bar";
import Providers from "@/components/layout/providers";
import { routing } from "@/i18n/routing";
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

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode }> & LocaleParams) {
  const { locale } = await params;

  // An unknown prefix (`/de/...`) reaches here only if the middleware let it through; 404 rather
  // than silently falling back, so bad locales never render as the default one.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Must precede any next-intl call in the subtree — it is what lets those calls resolve from the
  // known segment instead of a request-time lookup.
  setRequestLocale(locale);

  // Cached, so awaiting it here does not make the layout blocking. See lib/copyright-year.
  const year = await getCopyrightYear();

  return (
    <html lang={locale} suppressHydrationWarning className="motion-safe:scroll-smooth">
      <body className={`${manrope.variable} antialiased`}>
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <NextIntlClientProvider>
          <Providers>
            <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-x-clip">
              <NavigationBar />
              {children}
              <Footer year={year} />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
