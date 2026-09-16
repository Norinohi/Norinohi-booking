import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/server";
import { DiscountRouteModal } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function CreateDiscountModal() {
  /* Reached only by soft navigation from the gated list, which is not a guarantee — the
     overlay carries the same staff check as its hard-load twin in ../../create. */
  await requireRole(...STAFF_ROLES);

  return <DiscountRouteModal />;
}
