/*
 * Whether a boat has a mainsail worth a spec row.
 *
 * Keyed by the category group (`canonicalCategoryName` in the providers package), which is what
 * the read model's `category` holds. No vendor sends a sail type for a motor boat, and a card
 * that filled the gap with its default "batten mainsail" credited a speedboat with a sail. A
 * stated sail type always shows, so a gulet or trimaran whose operator describes its rig keeps it.
 */
const SAIL_CATEGORY_GROUPS = new Set(["Sailing yacht", "Catamaran", "Trimaran", "Motorsailer"]);

export function hasMainsail(category: string | null, sailType: string | null): boolean {
  return sailType !== null || (category !== null && SAIL_CATEGORY_GROUPS.has(category));
}
