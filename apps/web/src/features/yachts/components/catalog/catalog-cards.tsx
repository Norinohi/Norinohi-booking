import { getFormatter, getTranslations } from "next-intl/server";

import BoatCard from "@/components/shared/data-display/boat-card";

import { type ResultListing, toBoatCard } from "../../lib/to-boat-card";

/**
 * The page's boats, rendered on the server.
 *
 * Passed to `SearchScreen` as the results boundary's fallback, which is the only way they reach
 * the HTML: the live list is a client query that never resolves server-side. The client replaces
 * these with the same cards once it mounts, so the swap is invisible.
 */
export default async function CatalogCards({ listings }: { listings: ResultListing[] }) {
  const t = await getTranslations("Common.boatCard");
  const format = await getFormatter();
  const formatMoney = (amountMinor: number) => format.number(amountMinor / 100, "eur");

  return (
    <>
      {listings.map((listing, index) => (
        <BoatCard
          key={listing.id}
          {...toBoatCard(t, formatMoney, listing)}
          priority={index === 0}
        />
      ))}
    </>
  );
}
