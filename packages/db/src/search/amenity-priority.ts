/**
 * Picks the amenities a card should show, in the order an editor put them in.
 *
 * A yacht carries dozens of amenities and a preview has room for four, so which four appear is
 * an editorial decision rather than whatever the provider happened to list first: air
 * conditioning sells a charter and a bilge pump handle does not. The order comes from the
 * curated `popular_rank` on the equipment facet, so it is retuned on the admin screen rather
 * than in a release.
 *
 * Unranked amenities are kept and appended rather than dropped. A boat whose amenities are all
 * unranked -- a fresh database, or a vendor with its own vocabulary -- shows the same four
 * chips it showed before any of this existed, instead of showing none.
 *
 * @param amenities The listing's amenities, in whatever order it publishes them.
 * @param rankByValue Rank per amenity, keyed the way the equipment facet keys its options.
 * @param keyOf How an amenity is reduced to that key. The caller owns it because the search
 *   code and the facet contract already agree on one normalization and a second would silently
 *   stop matching.
 */
export function topAmenities(
  amenities: readonly string[],
  rankByValue: ReadonlyMap<string, number>,
  keyOf: (amenity: string) => string,
  limit = 4,
): string[] {
  if (limit <= 0) return [];

  /* Index carried explicitly: sort() is not required to be stable across engines for the
     unranked tail, and "the order the boat lists them" is the tiebreak we promised. */
  return amenities
    .map((amenity, index) => ({ amenity, index, rank: rankByValue.get(keyOf(amenity)) }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        if (left.rank === undefined) return 1;
        if (right.rank === undefined) return -1;
        return left.rank - right.rank;
      }
      return left.index - right.index;
    })
    .slice(0, limit)
    .map((entry) => entry.amenity);
}

/**
 * The curated amenities a boat actually has, in the editor's order.
 *
 * Distinct from `topAmenities` above, which fills a fixed number of slots and pads with whatever
 * the boat listed. This one answers the other question the card asks -- "which of the amenities
 * worth advertising does this boat have" -- so it returns only ranked values and however many
 * there are. The card shows the first few and hides the rest behind a count, and that count is
 * only honest if the list holds nothing but curated entries.
 *
 * The fallback matters as much as the ordering. A boat whose amenities are all unranked -- a
 * fresh database, or a vendor with its own vocabulary -- would otherwise produce a card with no
 * amenity chips at all, which is worse than the arbitrary few it showed before any of this
 * existed. So when nothing matches, the boat's own first `fallbackLimit` stand in.
 */
export function highlightAmenities(
  amenities: readonly string[],
  rankByValue: ReadonlyMap<string, number>,
  keyOf: (amenity: string) => string,
  fallbackLimit = 4,
): string[] {
  const ranked = amenities
    .map((amenity, index) => ({ amenity, index, rank: rankByValue.get(keyOf(amenity)) }))
    .filter(
      (entry): entry is { amenity: string; index: number; rank: number } =>
        entry.rank !== undefined,
    )
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.amenity);

  return ranked.length > 0 ? ranked : [...amenities].slice(0, fallbackLimit);
}
