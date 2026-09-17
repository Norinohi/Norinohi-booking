/*
 * Builder names a vendor keeps in its builder list for boats it has no builder for. NauSYS ships
 * one called "Unknown", and the 36 boats pointing at it became a shipyard of their own with a
 * catalogue page. The same list as `isPlaceholderBuilder` in `@yacht-charter/db/search/catalog-pages`,
 * which withholds the pages for rows synced before the projection dropped these.
 */
const PLACEHOLDER_BUILDERS = new Set(["unknown", "n a", "na", "none", "other", "not specified"]);

export function isPlaceholderBuilder(name: string | undefined): boolean {
  if (name === undefined) return false;
  return PLACEHOLDER_BUILDERS.has(
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
  );
}
