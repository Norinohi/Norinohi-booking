import { notFound } from "next/navigation";

import { DiscountRouteModal, findDiscount } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditDiscountModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const discount = findDiscount(id);

  if (!discount) {
    notFound();
  }

  return <DiscountRouteModal discount={discount} />;
}
