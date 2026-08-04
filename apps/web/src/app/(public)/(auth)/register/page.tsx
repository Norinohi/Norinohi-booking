import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RegisterScreen } from "@/features/auth";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo.Register");
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register",
    noIndex: true,
  });
}

export default function RegisterPage() {
  return <RegisterScreen />;
}
