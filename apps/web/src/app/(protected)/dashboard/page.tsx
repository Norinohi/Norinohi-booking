import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

import Dashboard from "./dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.Dashboard");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/dashboard",
    noIndex: true,
  });
}

export default async function DashboardPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {session.user.name}</p>
      <Dashboard session={session} />
    </div>
  );
}
