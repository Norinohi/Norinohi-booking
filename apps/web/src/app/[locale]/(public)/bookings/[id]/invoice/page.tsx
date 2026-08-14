import { getLocale, getTranslations } from "next-intl/server";

import { buildMetadata } from "@/lib/seo";

import { BookingInvoiceScreen } from "@/features/booking";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Invoice");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

/*
 * The invoice for one booking. Not prefetched: `booking.invoice` is keyed to one caller and the
 * page is opened rarely, so the client query is the whole data path.
 *
 * Deliberately outside the account area and with no session gate of its own. Someone who checked
 * out as a guest has no password yet and still has an invoice to pay, so the read authorises them
 * by the booking token their browser kept; the procedure decides, and a caller with neither a
 * session nor a token gets nothing back.
 */
export default async function BookingInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <BookingInvoiceScreen bookingId={id} />;
}
