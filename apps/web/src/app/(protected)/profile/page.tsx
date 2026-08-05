import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { ProfileScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <ProfileScreen user={{ name: session.user.name, email: session.user.email }} />;
}
