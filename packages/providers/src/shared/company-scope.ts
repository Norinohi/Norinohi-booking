/**
 * Which charter companies a deployment imports.
 *
 * Two lists rather than one because the two deployments want opposite defaults.
 * Staging imports one test company and nothing else, which an allowlist says
 * exactly. Production imports the whole credential except a handful of the
 * vendor's test companies, which an allowlist cannot say at all: it would have to
 * enumerate every real company and be edited whenever the vendor signs one.
 *
 * Exclusion wins over inclusion. An id in both lists is a contradiction, and the
 * safe reading of a contradiction about test data is to keep it out.
 */
export interface CompanyScope {
  /**
   * The allowlist, verbatim. Exposed because some vendor endpoints take a company
   * filter, and narrowing the query beats fetching everything and discarding it.
   * Empty means "everything the credential sees", so it is not a valid filter on
   * its own - callers must treat empty as "no narrowing", not "nothing".
   */
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  inScope(companyId: string): boolean;
}

/**
 * Ids stay strings because that is what `provider_record.external_id` and every
 * scope key downstream use; the vendor's numeric form never leaves the connector.
 */
export function parseCompanyIds(raw: string | undefined): readonly string[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function createCompanyScope(
  include: readonly string[],
  exclude: readonly string[],
): CompanyScope {
  const allowed = new Set(include);
  const denied = new Set(exclude);

  return {
    include,
    exclude,
    inScope(companyId) {
      if (denied.has(companyId)) return false;
      return allowed.size === 0 || allowed.has(companyId);
    },
  };
}

/** The scope of a deployment that has configured neither list: import everything. */
export const unscopedCompanies: CompanyScope = createCompanyScope([], []);

export function companyScopeFromEnv(
  includeRaw: string | undefined,
  excludeRaw: string | undefined,
): CompanyScope {
  return createCompanyScope(parseCompanyIds(includeRaw), parseCompanyIds(excludeRaw));
}
