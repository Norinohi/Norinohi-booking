import type { CompanyScope } from "../shared/company-scope";
import type { CatalogueSyncEvent } from "./runner";

export interface RetireCompaniesOptions {
  scope: CompanyScope;
  /**
   * Companies our fleet is currently filed under. Read from the database by the
   * caller so the catalogue streams stay pure functions of the vendor client.
   */
  listImportedCompanyIds?: () => Promise<readonly string[]>;
}

/**
 * Retires the fleets of companies an earlier, wider run imported.
 *
 * Narrowing the import scope stops us fetching a company, and a company we never
 * fetch emits no `scope-complete`, so nothing ever sweeps its yachts: they stay
 * active and their listings stay published indefinitely. Production hit this
 * exactly - a test company imported before the scope existed, still on sale after
 * it was excluded.
 *
 * The fix is to say the quiet part out loud. An empty scope-complete for the
 * company is a truthful statement - "this company's fleet is, as far as this
 * deployment is concerned, empty" - and the ordinary sweep does the rest:
 * `provider_record.active` goes false, and `hideOrphanedListings` hides every
 * listing left with no active source. Nothing new deletes anything, and nothing
 * new decides what "gone" means.
 *
 * Hidden, never deleted, and never automatically re-published. Putting a company
 * back in scope restores its records on the next run, but re-listing its yachts
 * stays a human decision - the same rule the orphan sweep already follows.
 */
export async function* retireOutOfScopeCompanies(
  options: RetireCompaniesOptions,
): AsyncIterable<CatalogueSyncEvent> {
  const { scope, listImportedCompanyIds } = options;
  if (!listImportedCompanyIds) return;

  // Neither list configured means "import everything", so nothing is out of scope
  // and there is no reason to pay for the query.
  if (scope.include.length === 0 && scope.exclude.length === 0) return;

  const imported = await listImportedCompanyIds();

  for (const companyId of imported) {
    if (scope.inScope(companyId)) continue;
    // No cursor: a retire is idempotent and re-running it costs one UPDATE that
    // matches nothing, so it is not worth a resume point.
    yield { type: "scope-complete", resourceType: "yacht", scopeKey: companyId };
  }
}
