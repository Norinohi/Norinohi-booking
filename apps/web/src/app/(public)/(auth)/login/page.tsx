import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginScreen } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.Login");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/login",
    noIndex: true,
  });
}

export default function LoginPage() {
  return <LoginScreen />;
}
