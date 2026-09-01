import type { CompanyScope } from "../shared/company-scope";
import type { CatalogueSyncEvent } from "./runner";

export interface RetireCompaniesOptions {
  scope: CompanyScope;
  /**
   * Companies our fleet is currently filed under. Read from the database by the
   * caller so the catalogue streams stay pure functions of the vendor client.
   */
  listImportedCompanyIds?: () => Promise<readonly string[]>;
  /**
   * Every in-scope company this run's company dump returned, or null when that
   * dump failed, was only partly understood, or was never read because the run
   * resumed past it.
   *
   * Null is not "no companies". It is "this run cannot say", and it withholds
   * the vendor half of the comparison rather than retiring on a guess.
   */
  vendorCompanyIds?: readonly string[] | null;
}

/**
 * Retires the fleets of companies whose yachts this run had no reason to fetch.
 *
 * A company we never fetch emits no `scope-complete`, so nothing ever sweeps its
 * yachts: they stay active and their listings stay published indefinitely. Two
 * different things put a company in that position, and both have been seen in
 * production:
 *
 * - We stopped asking. Narrowing the import scope excludes it. A test company
 *   imported before the scope existed was still on sale after it was excluded.
 * - The vendor stopped offering. It drops out of the company dump on its own,
 *   with no configuration change on our side. NauSYS company 102701 went this
 *   way and left 109 yachts published against a company the credential can no
 *   longer see.
 *
 * The second case is why `vendorCompanyIds` exists. Comparing against the scope
 * alone catches only companies we excluded, so an unscoped deployment - which is
 * every deployment that imports everything the credential sees - had no retire
 * path at all.
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
  const { scope, listImportedCompanyIds, vendorCompanyIds = null } = options;
  if (!listImportedCompanyIds) return;

  const isScoped = scope.include.length > 0 || scope.exclude.length > 0;

  /*
   * An empty dump is refused the same way `collectionOf` refuses one: "the vendor
   * has nothing" is the single reading that is definitely wrong, and acting on it
   * would retire the entire fleet on one bad response.
   */
  const vendorFleet =
    vendorCompanyIds !== null && vendorCompanyIds.length > 0 ? new Set(vendorCompanyIds) : null;

  // Nothing configured out and no trustworthy dump to compare against leaves
  // nothing this pass could decide, so it does not pay for the query.
  if (!isScoped && vendorFleet === null) return;

  const imported = await listImportedCompanyIds();

  for (const companyId of imported) {
    // No cursor on either retire: it is idempotent, and re-running it costs one
    // UPDATE that matches nothing, so it is not worth a resume point.
    if (!scope.inScope(companyId)) {
      yield { type: "scope-complete", resourceType: "yacht", scopeKey: companyId };
      continue;
    }

    // In scope, so we would have fetched it had the vendor still listed it.
    if (vendorFleet !== null && !vendorFleet.has(companyId)) {
      yield { type: "scope-complete", resourceType: "yacht", scopeKey: companyId };
    }
  }
}
