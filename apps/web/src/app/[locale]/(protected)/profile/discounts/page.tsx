import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { buildMetadata } from "@/lib/seo";

import { requireStaffPage } from "@/features/admin";
import { DiscountManagerScreen, prefetchDiscountManager } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Discounts");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/profile/discounts",
    noIndex: true,
  });
}

export default async function DiscountsPage() {
  const user = await requireStaffPage();

  return (
    <Hydrated prefetch={prefetchDiscountManager}>
      <DiscountManagerScreen user={{ name: user.name, email: user.email }} />
    </Hydrated>
  );
}
