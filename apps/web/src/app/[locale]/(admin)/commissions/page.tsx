import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { getSessionUser } from "@/lib/auth/server";
import { buildMetadata, SITE_NAME } from "@/lib/seo";

import { CommissionsScreen, prefetchCommissions } from "@/features/admin";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Commissions");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description", { brand: SITE_NAME }),
    path: "/commissions",
    noIndex: true,
  });
}

export default async function CommissionsPage() {
  /* The (admin) layout already redirected anyone without the staff role, so this only reads
   * the cached session back for the sidebar greeting. */
  const user = await getSessionUser();

  return (
    <Hydrated prefetch={prefetchCommissions}>
      <CommissionsScreen user={{ name: user?.name ?? "", email: user?.email ?? "" }} />
    </Hydrated>
  );
}
