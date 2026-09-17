import { getFormatter, getTranslations } from "next-intl/server";

import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";

import { type ResultListing, toYachtCard } from "../../lib/to-yacht-card";

/**
 * The page's boats, rendered on the server.
 *
 * Passed to `SearchScreen` as the results boundary's fallback, which is the only way they reach
 * the HTML: the live list is a client query that never resolves server-side. The client replaces
 * these with the same cards once it mounts, so the swap is invisible.
 */
export default async function CatalogCards({ listings }: { listings: ResultListing[] }) {
  const t = await getTranslations("Common.boatCard");
  const tCrew = await getTranslations("Common.crewTypes");
  const tBadge = await getTranslations("Common.boatCard.badges");
  const format = await getFormatter();
  /* The server-side twin of `useMoney`: same shape, same default, no hook. */
  const formatMoney = (amountMinor: number, currency = "EUR") =>
    format.number(amountMinor / 100, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <>
      {listings.map((listing, index) => (
        <YachtCard
          key={listing.id}
          layout="row"
          {...toYachtCard(t, tCrew, tBadge, formatMoney, listing)}
          openInNewTab
          priority={index === 0}
        />
      ))}
    </>
  );
}
