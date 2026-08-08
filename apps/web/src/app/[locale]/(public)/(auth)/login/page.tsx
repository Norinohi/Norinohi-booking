import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignInForm } from "@/features/auth";
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
