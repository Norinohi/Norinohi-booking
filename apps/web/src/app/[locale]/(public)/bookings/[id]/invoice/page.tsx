import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";
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
 * The invoice for one booking. Not prefetched: `booking.invoice` is a protected read keyed to the
 * signed-in user and the page is opened rarely, so the client query is the whole data path.
 */
export default async function BookingInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const { id } = await params;
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) {
    return redirect({ href: "/login", locale });
  }

  return <BookingInvoiceScreen bookingId={id} />;
}
