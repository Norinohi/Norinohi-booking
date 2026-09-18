import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { getSessionUser } from "@/lib/auth/server";
import { buildMetadata } from "@/lib/seo";

import { UsersScreen, prefetchUsers } from "@/features/admin";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Users");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/admin/users",
    noIndex: true,
  });
}

export default async function UsersPage() {
  /* The (admin) layout already redirected anyone without the staff role. */
  const user = await getSessionUser();

  return (
    <Hydrated prefetch={prefetchUsers}>
      <UsersScreen user={{ name: user?.name ?? "", email: user?.email ?? "" }} />
    </Hydrated>
  );
}
