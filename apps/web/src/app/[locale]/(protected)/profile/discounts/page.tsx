import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { DiscountManagerScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Discounts");
  return { title: t("title") };
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
