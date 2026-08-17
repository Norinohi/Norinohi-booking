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
]);

/** The marketplace-facing category for a vendor category code, or null when unclassified. */
export function canonicalCategoryName(code: string): string | null {
  return CATEGORY_GROUPS.get(code) ?? null;
}
