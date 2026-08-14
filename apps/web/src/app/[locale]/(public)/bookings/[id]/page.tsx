import { getLocale, getTranslations } from "next-intl/server";

import { buildMetadata } from "@/lib/seo";

import { BookingDetailScreen } from "@/features/booking";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.BookingDetail");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

/*
 * One booking, after the fact. Not prefetched: the read is keyed to one caller and the page is
 * opened rarely, so the client query is the whole data path.
 *
 * Same access rule as the invoice and balance pages beside it — session or the guest token —
 * because a customer who checked out without an account still owns this booking.
 */
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <BookingDetailScreen bookingId={id} />;
}
