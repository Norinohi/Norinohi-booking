import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/server";
import Hydrated from "@/components/shared/layout/hydrated";

import { DiscountRouteModal, prefetchDiscount } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditDiscountModal({ params }: { params: Promise<{ id: string }> }) {
  /* Same staff check as the hard-load twin in ../../../edit/[id]. */
  await requireRole(...STAFF_ROLES);
  const { id } = await params;

  return (
    <Hydrated prefetch={(queryClient) => prefetchDiscount(queryClient, id)}>
      <DiscountRouteModal discountId={id} />
    </Hydrated>
  );
}
