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
