import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { DiscountManagerScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Discounts");
  return { title: t("title") };
}

export default async function DiscountsPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  /* Platform-staff page: same staff/admin gate as the API's staffProcedure. The role
   * column isn't in the auth client's types, hence the cast (packages/api convention). */
  const role = (session.user as { role?: string }).role;
  if (role !== "staff" && role !== "admin") {
    redirect("/profile");
  }

  return <DiscountManagerScreen user={{ name: session.user.name, email: session.user.email }} />;
}
