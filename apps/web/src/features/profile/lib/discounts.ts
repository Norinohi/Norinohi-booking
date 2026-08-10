/*
 * Static option sets for the Discount & Price Manager. Row data comes from the
 * admin oRPC procedures (see api/queries.ts); view-types live in ../types.
 */

/**
 * Category checkboxes in the create/edit modal, mapped to the seeded taxonomy ids
 * (packages/db/src/seed.ts). The API validates category targets against
 * yacht_category.id and nothing public lists those ids yet — replace this with a
 * categories endpoint when the backend exposes one. Keys index `Discounts.applies`.
 */
export const CATEGORY_TARGET_OPTIONS = [
  { id: "cat_catamaran", key: "allCatamarans" },
  { id: "cat_sailing", key: "allSailingYachts" },
  { id: "cat_motor", key: "allMotorYachts" },
  { id: "cat_luxury", key: "allLuxuryYachts" },
] as const;

export type CategoryTargetKey = (typeof CATEGORY_TARGET_OPTIONS)[number]["key"];
