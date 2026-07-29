import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Manrope } from "next/font/google";

import "../index.css";
import Footer from "@/components/layout/footer";
import NavigationBar from "@/components/layout/navigation-bar";
import Providers from "@/components/layout/providers";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yacht Charter",
  description: "Yacht Charter",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${manrope.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
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
