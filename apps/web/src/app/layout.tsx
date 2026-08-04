import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Manrope } from "next/font/google";

import "../index.css";
import Footer from "@/components/layout/footer";
import NavigationBar from "@/components/layout/navigation-bar";
import Providers from "@/components/layout/providers";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Layout");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${manrope.variable} antialiased`}>
        <noscript>
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <NextIntlClientProvider>
          <Providers>
            <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-x-clip">
              <NavigationBar />
              {children}
              <Footer />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
