import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { requireSignedIn } from "@/lib/auth/server";
import { buildMetadata } from "@/lib/seo";

import { BookingsScreen, prefetchBookings } from "@/features/profile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Bookings");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/profile/bookings",
    noIndex: true,
  });
}

export default async function BookingsPage() {
  const user = await requireSignedIn();
  const locale = await getLocale();

  return (
    <Hydrated prefetch={(queryClient) => prefetchBookings(queryClient, { page: 1, locale })}>
      <BookingsScreen user={{ name: user.name, email: user.email }} />
    </Hydrated>
  );
}
