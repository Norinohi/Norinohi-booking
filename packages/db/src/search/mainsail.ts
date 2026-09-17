/*
 * Whether a boat has a mainsail worth a spec row.
 *
 * Keyed by the category group (`canonicalCategoryName` in the providers package), which is what
 * the read model's `category` holds. No vendor sends a sail type for a motor boat, and a card
 * that filled the gap with its default "batten mainsail" credited a speedboat with a sail. A
 * stated sail type always shows, so a gulet or trimaran whose operator describes its rig keeps it.
 *
 * The group is compared in its stored English form only. Callers holding a localized doc pass
 * `categoryKey`: comparing "Вітрильна яхта" against this set dropped the row outside en.
 */
const SAIL_CATEGORY_GROUPS = new Set(["Sailing yacht", "Catamaran", "Trimaran", "Motorsailer"]);

export function hasMainsail(categoryKey: string | null, sailType: string | null): boolean {
  return sailType !== null || (categoryKey !== null && SAIL_CATEGORY_GROUPS.has(categoryKey));
}

/** `hasMainsail` for a search doc that may have been through `localizeSearchDocs`. */
export function docHasMainsail(doc: {
  category: string | null;
  categoryKey?: string | null;
  sailType: string | null;
}): boolean {
  return hasMainsail(doc.categoryKey === undefined ? doc.category : doc.categoryKey, doc.sailType);
}
