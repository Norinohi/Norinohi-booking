import { notFound } from "next/navigation";

import { DiscountRouteModal, findDiscount } from "@/features/profile";

export default async function EditDiscountModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const discount = findDiscount(id);

  if (!discount) {
    notFound();
  }

  return <DiscountRouteModal discount={discount} />;
}
