import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { DiscountRouteModal } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Discounts");
  return { title: t("dialog.createTitle") };
}

/* Hard-load fallback of the intercepted /create overlay: same staff/admin gate as the list;
 * closing navigates to the list instead of history-back. */
export default async function CreateDiscountPage() {
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "staff" && role !== "admin") {
    redirect("/profile");
  }

  return <DiscountRouteModal standalone />;
}
