import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { requireSignedIn } from "@/lib/auth/server";
import { buildMetadata } from "@/lib/seo";

import { prefetchProfile, ProfileScreen } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Profile");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/profile",
    noIndex: true,
  });
}

export default async function ProfilePage() {
  await requireSignedIn();

  return (
    <Hydrated prefetch={prefetchProfile}>
      <ProfileScreen />
    </Hydrated>
  );
}
