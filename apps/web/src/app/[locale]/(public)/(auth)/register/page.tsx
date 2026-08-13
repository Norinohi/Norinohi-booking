import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { DEFAULT_SIGNED_IN_PATH, SignUpForm } from "@/features/auth";
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
  const t = await getTranslations("Seo.Register");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/register",
    noIndex: true,
  });
}

export default async function RegisterPage() {
  const locale = await getLocale();

  /* Signing up while signed in would create nothing, so an account holder is sent on instead. */
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });
  if (session?.user) {
    return redirect({ href: DEFAULT_SIGNED_IN_PATH, locale });
  }

  // nuqs reads the query string, so the screen has to sit behind a boundary to prerender.
  // The real loading skeleton lands with the instant-navigation work.
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
