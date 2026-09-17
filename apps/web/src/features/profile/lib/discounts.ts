/*
 * Static option sets for the Discount & Price Manager. Row data comes from the
 * admin oRPC procedures (see api/queries.ts); view-types live in ../types.
 */

/**
 * Category checkboxes in the create/edit modal. Each targets a category group, the canonical name
 * the boat-type filter lists, because the ids behind one group differ per vendor and per database:
 * the seed's `cat_motor` exists nowhere a real sync has run. Keys index `Discounts.applies`.
 */
export const CATEGORY_TARGET_OPTIONS = [
  { id: "Sailing yacht", key: "allSailingYachts" },
  { id: "Catamaran", key: "allCatamarans" },
  { id: "Motor yacht", key: "allMotorYachts" },
  { id: "Motor boat", key: "allMotorboats" },
  { id: "Gulet", key: "allGullets" },
] as const;

export type CategoryTargetKey = (typeof CATEGORY_TARGET_OPTIONS)[number]["key"];
