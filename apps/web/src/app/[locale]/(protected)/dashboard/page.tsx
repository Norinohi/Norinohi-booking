import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";

import { authClient } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

import Dashboard from "./dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Seo.Dashboard");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/dashboard",
    noIndex: true,
  });
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    return redirect({ href: "/login", locale });
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {session.user.name}</p>
      <Dashboard session={session} />
    </div>
  );
}
