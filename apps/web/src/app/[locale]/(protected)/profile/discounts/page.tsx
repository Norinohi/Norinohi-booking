import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

import { DiscountManagerScreen } from "@/features/profile";

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

  /* Platform-staff page: same staff/admin gate as the API's staffProcedure. The role
   * column isn't in the auth client's types, hence the cast (packages/api convention). */
  const role = (session.user as { role?: string }).role;
  if (role !== "staff" && role !== "admin") {
    return redirect({ href: "/profile", locale });
  }

  return <DiscountManagerScreen user={{ name: session.user.name, email: session.user.email }} />;
}
