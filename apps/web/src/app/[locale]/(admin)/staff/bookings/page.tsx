import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { buildMetadata } from "@/lib/seo";

import { BookingsScreen, getAdminUser, prefetchAdminBookings } from "@/features/admin";

/*
 * Under /staff for the same reason its [id] sibling is: (admin) is URL-invisible, so filing
 * this as (admin)/bookings would collide with the customer's own (public)/bookings.
 */

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.StaffBookings");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/staff/bookings",
    noIndex: true,
  });
}

export default async function StaffBookingsPage() {
  /* The (admin) layout already redirected anyone without the staff role, so this only reads
   * the cached session back for the sidebar greeting. */
  const user = await getAdminUser();

  return (
    <Hydrated prefetch={prefetchAdminBookings}>
      <BookingsScreen user={{ name: user?.name ?? "", email: user?.email ?? "" }} />
    </Hydrated>
  );
}
