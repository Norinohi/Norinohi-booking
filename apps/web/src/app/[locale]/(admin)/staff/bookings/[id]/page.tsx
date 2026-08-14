import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { buildMetadata } from "@/lib/seo";

import { prefetchAdminBooking, StaffBookingScreen } from "@/features/admin";

/*
 * Under /staff rather than alongside the customer's /bookings/[id]: the (admin) group is
 * URL-invisible, so filing this as (admin)/bookings/[id] would resolve to the same path as
 * (public)/bookings/[id] and Next would refuse to build. The prefix is also honest — this URL
 * shows another customer's booking, and it should not look like the customer's own.
 */

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Seo.StaffBooking");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/staff/bookings",
    noIndex: true,
  });
}

export default async function StaffBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Hydrated prefetch={(queryClient) => prefetchAdminBooking(queryClient, id)}>
      <StaffBookingScreen id={id} />
    </Hydrated>
  );
}
