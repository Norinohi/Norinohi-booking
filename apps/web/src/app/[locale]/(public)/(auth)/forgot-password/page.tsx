import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ForgotPasswordForm } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.ForgotPassword");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/forgot-password",
    noIndex: true,
  });
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; welcome?: string }>;
}) {
  const { email, welcome } = await searchParams;
  return <ForgotPasswordForm email={email} firstPassword={welcome === "1"} />;
}
