import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { getSessionUser } from "@/lib/auth/server";
import { buildMetadata } from "@/lib/seo";

import { DuplicateReviewScreen, prefetchDuplicateQueue } from "@/features/admin";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Duplicates");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/admin/duplicates",
    noIndex: true,
  });
}

export default async function DuplicatesPage() {
  /* The (admin) layout already redirected anyone without the staff role, so this only reads
   * the cached session back for the sidebar greeting. */
  const user = await getSessionUser();

  return (
    <Hydrated prefetch={prefetchDuplicateQueue}>
      <DuplicateReviewScreen user={{ name: user?.name ?? "", email: user?.email ?? "" }} />
    </Hydrated>
  );
}
