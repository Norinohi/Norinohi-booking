import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { authClient, isStaffRole, userRole } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

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

  /* Platform-staff page: same staff/admin gate as the API's staffProcedure. */
  if (!isStaffRole(userRole(session.user))) {
    return redirect({ href: "/profile", locale });
  }

  return (
    <Hydrated prefetch={prefetchDiscountManager}>
      <DiscountManagerScreen user={{ name: session.user.name, email: session.user.email }} />
    </Hydrated>
  );
}
