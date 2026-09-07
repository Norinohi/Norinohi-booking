/*
 * Vendor yacht categories collapsed onto the categories the marketplace presents.
 *
 * NauSYS ships 19 categories, most of them near-synonyms of each other ("Luxury
 * catamaran" is a catamaran; "Motor boat" is a small motor yacht). Left as-is every
 * one of them becomes its own search facet, and the homepage renders a card per
 * facet — so a single listing in a rarely-used vendor category puts an imageless
 * card on the front page. Grouping happens here rather than by renaming the vendor
 * rows so `yacht_category.name` keeps saying what the operator actually listed.
 *
 * Keyed by `yacht_category.code` (`<provider>:<vendor id>`), because vendor display
 * names are localized and get re-worded between syncs while the ids do not.
 *
 * A code that is absent from this map keeps its own name — a category we have not
 * classified stays visible and searchable rather than silently vanishing into a
 * bucket. It just will not have facet media until someone adds a row for it.
 */
const CATEGORY_GROUPS = new Map([
  ["nausys:51", "Catamaran"],
  ["nausys:4942740", "Catamaran"], // Luxury catamaran
  ["nausys:112727", "Catamaran"], // Power catamaran

  ["nausys:1", "Sailing yacht"],
  ["nausys:625371", "Sailing yacht"], // Luxury sailing yacht
  ["nausys:1505715", "Sailing yacht"], // Wooden yacht

  ["nausys:101", "Motor yacht"],
  ["nausys:120895", "Motor yacht"], // Motor boat
  ["nausys:828326", "Motor yacht"], // Luxury motor yacht
  ["nausys:1163407", "Motor yacht"], // Speed boat

  ["nausys:126977", "Motorsailer"],
  ["nausys:565915", "Motorsailer"], // Fisherman
  ["nausys:12798239", "Motorsailer"], // Mini cruiser
  ["nausys:115791", "Motorsailer"], // Rubber boat (R.I.B.)

  ["nausys:43242759", "House boat"],
  ["nausys:17355539", "House boat"], // Floating villa

  ["nausys:102", "Gulet"],
  ["nausys:841932", "Trimaran"],
  ["nausys:100460", "Jet Ski"],

  /*
   * Booking Manager names the same hulls differently, and until these rows existed every one
   * of them arrived unclassified and became a facet of its own beside the NauSYS equivalent:
   * "Motoryacht" (414 boats) next to "Motor yacht" (264), "Houseboat" (301) next to
   * "House boat" (15), with identical copy and the same stock photo on both cards.
   *
   * Its codes are slugs rather than ids, because the REST catalogue states a category only by
   * name. Vendor renames therefore land here as a new unclassified code rather than a silently
   * re-pointed one, which is the safer of the two failures.
   */
  ["booking_manager:catamaran", "Catamaran"],
  ["booking_manager:power-catamaran", "Catamaran"],

  ["booking_manager:sail-boat", "Sailing yacht"],
  ["booking_manager:wooden-boat", "Sailing yacht"],

  ["booking_manager:motoryacht", "Motor yacht"],
  ["booking_manager:motor-boat", "Motor yacht"],
  ["booking_manager:motor-cruiser", "Motor yacht"],
  ["booking_manager:cruiser", "Motor yacht"], // Three boats, all titled "… Motoryacht"

  ["booking_manager:motorsailer", "Motorsailer"],
  ["booking_manager:rubber-boat", "Motorsailer"], // Follows nausys:115791; both are arguably wrong

  ["booking_manager:houseboat", "House boat"],
  ["booking_manager:gulet", "Gulet"],
  ["booking_manager:trimaran", "Trimaran"],
]);

/** The marketplace-facing category for a vendor category code, or null when unclassified. */
export function canonicalCategoryName(code: string): string | null {
  return CATEGORY_GROUPS.get(code) ?? null;
}
