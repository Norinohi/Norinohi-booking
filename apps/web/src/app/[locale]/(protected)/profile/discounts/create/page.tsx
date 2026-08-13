import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient, isStaffRole, userRole } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

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
  const locale = await getLocale();
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) {
    return redirect({ href: "/login", locale });
  }

  /* Platform-staff page: same staff/admin gate as the API's staffProcedure. */
  if (!isStaffRole(userRole(session.user))) {
    return redirect({ href: "/profile", locale });
  }

  return <DiscountRouteModal standalone />;
}
