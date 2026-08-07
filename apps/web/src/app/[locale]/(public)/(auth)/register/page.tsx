import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignUpForm } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Register");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/register",
    noIndex: true,
  });
}

export default function RegisterPage() {
  // nuqs reads the query string, so the screen has to sit behind a boundary to prerender.
  // The real loading skeleton lands with the instant-navigation work.
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
