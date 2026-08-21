import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BookingSupportScreen } from "@/features/booking";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Support");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/support",
    noIndex: true,
  });
}

export default function SupportPage() {
  // nuqs reads the query string, so the screen has to sit behind a boundary to prerender.
  return (
    <Suspense fallback={null}>
      <BookingSupportScreen />
    </Suspense>
  );
}
