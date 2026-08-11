/**
 * One-off facet media seed, run by hand from the deployed container — same
 * pattern as sync-catalogue.ts and sync-availability.ts. Seeds only the
 * editorial images/descriptions for search filter facets (country, category,
 * region cards); it never touches the catalogue itself, so it's safe to run
 * against an environment whose listings came entirely from a provider sync.
 *
 * `pnpm --filter @yacht-charter/db seed -- --facets-only` does the same thing,
 * but needs `tsx` on the machine running it — a production container may not
 * have it. This is the compiled equivalent for exactly that case.
 */
import { insertFacetMedia } from "@yacht-charter/db/seed";

const result = await insertFacetMedia();

console.log(
  `Seeded ${result.facetsSeeded} facet media entries and ${result.translationsSeeded} translations`,
);
