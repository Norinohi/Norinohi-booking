import type { RestOffer } from "./endpoints";

/**
 * Which of several offers for the same charter we treat as the one on sale.
 *
 * Shared on purpose. The quote picks an offer to price and the availability sweep picks one to
 * record, and if the two rank differently the search card advertises one charter while the
 * booking sidebar quotes another - which is exactly the defect this repo hit when the sweep
 * took the cheapest by rate and the quote took the vendor's first.
 */

/** A charter that ends somewhere other than it started, which is what a one-way fee is charged on. */
export function isOneWay(offer: RestOffer): boolean {
  return (
    offer.startBaseId != null && offer.endBaseId != null && offer.startBaseId !== offer.endBaseId
  );
}

/**
 * What the charter costs together, in the vendor's major units, because the obligatory extras
 * are the whole point: two offers for one hull quote the same 809 EUR and differ by a 155 EUR
 * fee attached to only one of them. A missing figure sorts last rather than as free.
 */
export function allInPrice(offer: RestOffer): number {
  const price = offer.price ?? Number.MAX_SAFE_INTEGER;
  return price + (offer.obligatoryExtrasPrice ?? 0);
}

/** Same-base before one-way, then cheapest all-in. A stable sort keeps vendor order as the tie. */
export function rankOffers(candidates: readonly RestOffer[]): RestOffer[] {
  return [...candidates].sort(
    (left, right) =>
      Number(isOneWay(left)) - Number(isOneWay(right)) || allInPrice(left) - allInPrice(right),
  );
}
