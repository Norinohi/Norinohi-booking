import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { DiscountRouteModal, findDiscount } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Discounts");
  return { title: t("dialog.editTitle") };
}

/* Hard-load fallback of the intercepted /edit/[id] overlay — see ../create/page.tsx. */
export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const discount = findDiscount(id);

  if (!discount) {
    notFound();
  }

  return <DiscountRouteModal discount={discount} standalone />;
}
