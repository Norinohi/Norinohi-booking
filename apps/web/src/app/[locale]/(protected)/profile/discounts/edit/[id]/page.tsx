import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { authClient } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

import { DiscountRouteModal, prefetchDiscount } from "@/features/profile";

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
    title: t("dialog.editTitle"),
    description: seo("description"),
    path: `/profile/discounts/edit/${id}`,
    noIndex: true,
  });
}

/* Hard-load fallback of the intercepted /edit/[id] overlay — see ../../create/page.tsx. */
export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) {
    return redirect({ href: "/login", locale });
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "staff" && role !== "admin") {
    return redirect({ href: "/profile", locale });
  }

  const { id } = await params;

  return (
    <Hydrated prefetch={(queryClient) => prefetchDiscount(queryClient, id)}>
      <DiscountRouteModal discountId={id} standalone />
    </Hydrated>
  );
}
