import { getLocale, getTranslations } from "next-intl/server";

import { buildMetadata } from "@/lib/seo";

import { requireStaffPage } from "@/features/admin";
import { DiscountRouteModal } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Discounts");
  const seo = await getTranslations("Seo.Discounts");
  return buildMetadata({
    locale,
    title: t("dialog.createTitle"),
    description: seo("description"),
    path: "/profile/discounts/create",
    noIndex: true,
  });
}

/* Hard-load fallback of the intercepted /create overlay: same staff/admin gate as the list;
 * closing navigates to the list instead of history-back. */
export default async function CreateDiscountPage() {
  await requireStaffPage();

  return <DiscountRouteModal standalone />;
}
