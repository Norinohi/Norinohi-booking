import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { authClient } from "@/lib/auth-client";

import { prefetchProfile, ProfileScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
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
    <Hydrated prefetch={prefetchProfile}>
      <ProfileScreen />
    </Hydrated>
  );
}
