import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { ReferralsScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Referrals");
  return { title: t("title") };
}

export default async function ReferralsPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <ReferralsScreen user={{ name: session.user.name, email: session.user.email }} />;
}
