import { notFound } from "next/navigation";

import { findYachtPrice, PriceRouteModal } from "@/features/profile";

export default async function EditPriceModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yacht = findYachtPrice(id);

  if (!yacht) {
    notFound();
  }

  return <PriceRouteModal yacht={yacht} />;
}
