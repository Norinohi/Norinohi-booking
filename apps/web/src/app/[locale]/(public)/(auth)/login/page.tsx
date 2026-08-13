import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { SignInForm, signedInTarget } from "@/features/auth";
import { redirect } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const [locale, { redirect: returnTo }] = await Promise.all([getLocale(), searchParams]);

  /* Already signed in: send them where signing in would have, rather than showing a form
     whose only outcome is the session they already hold. */
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });
  if (session?.user) {
    return redirect({ href: signedInTarget(returnTo), locale });
  }

  return <SignInForm redirect={returnTo} />;
}
