import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { buildMetadata } from "@/lib/seo";

import { getAdminUser, PaymentsScreen, prefetchPayments } from "@/features/admin";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Payments");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/payments",
    noIndex: true,
  });
}

export default async function PaymentsPage() {
  /* The (admin) layout already redirected anyone without the staff role, so this only reads
   * the cached session back for the sidebar greeting. */
  const user = await getAdminUser();

  return (
    <Hydrated prefetch={prefetchPayments}>
      <PaymentsScreen user={{ name: user?.name ?? "", email: user?.email ?? "" }} />
    </Hydrated>
  );
}
