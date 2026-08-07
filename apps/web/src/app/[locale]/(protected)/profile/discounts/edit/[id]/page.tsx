import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { DiscountRouteModal, findDiscount } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Discounts");
  return { title: t("dialog.editTitle") };
}

/* Hard-load fallback of the intercepted /edit/[id] overlay — see ../create/page.tsx. */
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
  const discount = findDiscount(id);

  if (!discount) {
    notFound();
  }

  return <DiscountRouteModal discount={discount} standalone />;
}
