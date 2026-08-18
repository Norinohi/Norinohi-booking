import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ResetPasswordForm } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
export const instant = false;

type ResetPasswordSearchParams = { token?: string; error?: string; welcome?: string };

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ResetPasswordSearchParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { welcome } = await searchParams;
  const t = await getTranslations(welcome === "1" ? "Seo.SetPassword" : "Seo.ResetPassword");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/reset-password",
    noIndex: true,
  });
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordSearchParams>;
}) {
  const { token, error, welcome } = await searchParams;
  return <ResetPasswordForm token={token} error={error} firstPassword={welcome === "1"} />;
}
