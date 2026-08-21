import Hydrated from "@/components/shared/layout/hydrated";

import { requireStaffPage } from "@/features/admin";
import { prefetchListingPrice, PriceRouteModal } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function EditPriceModal({ params }: { params: Promise<{ id: string }> }) {
  /* Same staff check as the hard-load twin in ../../../prices/[id]. */
  await requireStaffPage();
  const { id } = await params;

  return (
    <Hydrated prefetch={(queryClient) => prefetchListingPrice(queryClient, id)}>
      <PriceRouteModal listingId={id} />
    </Hydrated>
  );
}
