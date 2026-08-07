import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignInForm } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Login");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/login",
    noIndex: true,
  });
}

export default function LoginPage() {
  return <SignInForm />;
}
