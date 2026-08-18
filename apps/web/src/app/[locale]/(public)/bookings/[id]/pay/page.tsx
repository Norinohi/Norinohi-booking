import { getLocale, getTranslations } from "next-intl/server";

import { buildMetadata } from "@/lib/seo";

import { BookingBalanceScreen } from "@/features/booking";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Balance");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

/*
 * Paying the rest of one booking. Not prefetched: the read is keyed to one caller and the page
 * is opened rarely, so the client query is the whole data path.
 *
 * Deliberately outside the account area and with no session gate of its own, for the same reason
 * as the invoice page: a guest checkout has no password yet and still owes this money. The read
 * authorises by session or by the booking token their browser kept, and a caller with neither
 * gets nothing back.
 */
export default async function BookingBalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <BookingBalanceScreen bookingId={id} />;
}
