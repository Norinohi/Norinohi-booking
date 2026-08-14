import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { buildMetadata } from "@/lib/seo";

import { requireStaffPage } from "@/features/admin";
import { prefetchListingPrices, PriceRouteModal } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Discounts");
  const seo = await getTranslations("Seo.Discounts");
  return buildMetadata({
    locale,
    title: t("prices.dialog.title"),
    description: seo("description"),
    path: `/profile/discounts/prices/${id}`,
    noIndex: true,
  });
}

/* Hard-load fallback of the intercepted /prices/[id] overlay — see ../../create/page.tsx. */
export default async function EditPricePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();

  const { id } = await params;

  return (
    <Hydrated prefetch={prefetchListingPrices}>
      <PriceRouteModal listingId={id} standalone />
    </Hydrated>
  );
}
