import { notFound } from "next/navigation";

import { findYachtPrice, PriceRouteModal } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditPriceModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yacht = findYachtPrice(id);

  if (!yacht) {
    notFound();
  }

  return <PriceRouteModal yacht={yacht} />;
}
