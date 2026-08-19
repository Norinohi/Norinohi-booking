import { z } from "zod";

import { AuthError, ContractError } from "../shared/errors";
import type { JsonObject } from "../shared/json";
import type { JsonValue } from "../shared/json";
import { idOf, objectsOf } from "../shared/projection-helpers";
import { type CompanyScope, unscopedCompanies } from "../shared/company-scope";
import { retireOutOfScopeCompanies } from "../sync/retire-companies";
import type { CatalogueSyncEvent, CatalogueSyncSource, SyncReporter } from "../sync/runner";
import type { ProviderResourceType } from "../types";
import type { BookingManagerClient } from "./client";
import {
  bookingManagerEndpoints,
  restBaseListSchema,
  restCompanyListSchema,
  restCountryListSchema,
  restEquipmentListSchema,
  restSailingAreaListSchema,
  restShipyardListSchema,
  restWorldRegionListSchema,
  restYachtListSchema,
  restYachtTypeListSchema,
} from "./endpoints";

/**
 * Phase A for Booking Manager: reference data first, then the fleet.
 *
 * The vendor answers every catalogue endpoint with a bare JSON array, so unlike
 * NauSYS there is no envelope to unwrap and no collection key to guess. What is
 * parsed here is only enough to find an id; the payload is retained whole and
 * interpreted in `projection.ts`.
 */

interface CatalogueStep {
  resourceType: ProviderResourceType;
  endpoint: string;
  fetch: (client: BookingManagerClient) => Promise<JsonValue[]>;
  /** Defaults to the numeric `id`; `/yachtTypes` has none. */
  externalIdOf?: (item: JsonObject) => string | null;
}

/**
 * FK order, not vendor order: the projection resolves references across dumps,
 * and a yacht read before its company and base has nothing to hang off.
 *
 * Two resource types are named for their canonical role rather than the vendor's
 * word for them. `/equipment` is the amenity catalogue but lands as
 * `equipment_category` because that is the enum slot this provider's inventory
 * taxonomy occupies; `/yachtTypes` is a category, not a model.
 */
const CATALOGUE_STEPS: CatalogueStep[] = [
  {
    resourceType: "country",
    endpoint: bookingManagerEndpoints.countries,
    fetch: (client) => client.get(bookingManagerEndpoints.countries, restCountryListSchema),
  },
  {
    resourceType: "region",
    endpoint: bookingManagerEndpoints.worldRegions,
    fetch: (client) => client.get(bookingManagerEndpoints.worldRegions, restWorldRegionListSchema),
  },
  {
    resourceType: "location",
    endpoint: bookingManagerEndpoints.sailingAreas,
    fetch: (client) => client.get(bookingManagerEndpoints.sailingAreas, restSailingAreaListSchema),
  },
  {
    resourceType: "equipment_category",
    endpoint: bookingManagerEndpoints.equipment,
    fetch: (client) => client.get(bookingManagerEndpoints.equipment, restEquipmentListSchema),
  },
  {
    resourceType: "builder",
    endpoint: bookingManagerEndpoints.shipyards,
    fetch: (client) => client.get(bookingManagerEndpoints.shipyards, restShipyardListSchema),
  },
  {
    resourceType: "category",
    endpoint: bookingManagerEndpoints.yachtTypes,
    fetch: (client) => client.get(bookingManagerEndpoints.yachtTypes, restYachtTypeListSchema),
    // The only keyless collection the vendor ships: a yacht type is its name, and
    // `yacht.kind` refers back to it by that name.
    externalIdOf: (item) => idOf(item.name),
  },
  {
    resourceType: "company",
    endpoint: bookingManagerEndpoints.companies,
    fetch: (client) => client.get(bookingManagerEndpoints.companies, restCompanyListSchema),
  },
  {
    resourceType: "base",
    endpoint: bookingManagerEndpoints.bases,
    fetch: (client) => client.get(bookingManagerEndpoints.bases, restBaseListSchema),
  },
];

/** The per-company yacht sweep, addressed as one more step so the cursor stays flat. */
const YACHT_STEP = CATALOGUE_STEPS.length;

const COMPANY_STEP = CATALOGUE_STEPS.findIndex((step) => step.resourceType === "company");

/**
 * `inventory=raw` is what makes the vendor include `equipmentRaw`, and that array
 * is the only place the catalogue names an equipment category. Without it the
 * projection has amenities but nothing to file them under.
 */
const YACHT_QUERY = { inventory: "raw" } as const;

export interface BookingManagerCatalogueCursor {
  step: number;
  companyIndex: number;
  /**
   * The company `companyIndex` pointed at when the cursor was written.
   *
   * A position in a list only means something against the same list. Narrowing the
   * scope rebuilds it - 1308 entries become one - and the old index then addresses
   * a company that is not there, so the resume skips the whole sweep and reports
   * success. That is not hypothetical: a scoped run on production walked zero
   * yachts, wrote no prices, and still retired every company it had excluded.
   */
  companyId?: string;
}

export function parseBookingManagerCatalogueCursor(
  value: unknown,
): BookingManagerCatalogueCursor | null {
  const parsed = z
    .object({
      step: z.number().int().min(0).max(YACHT_STEP),
      companyIndex: z.number().int().min(0).default(0),
      companyId: z.string().optional(),
    })
    .safeParse(value);

  return parsed.success ? parsed.data : null;
}

export interface BookingManagerCatalogueOptions {
  resume?: BookingManagerCatalogueCursor | null;
  /**
   * Charter companies to import. Unconfigured imports everything the credential sees.
   *
   * Applied to the company dump as well as the yacht sweep, so a scoped run does
   * not leave 1300 operator rows standing behind eleven boats.
   */
  companyScope?: CompanyScope;
  /**
   * Companies our fleet is filed under, for retiring the ones now out of scope.
   * Injected rather than queried here so this stream stays a pure function of the
   * vendor client, which is what its tests fake.
   */
  listImportedCompanyIds?: () => Promise<readonly string[]>;
  /** Recoverable failures go here so the stream survives them; see below. */
  reporter?: Pick<SyncReporter, "reportError">;
}

/**
 * The whole Booking Manager catalogue as an event stream.
 *
 * Only an auth failure is thrown: it repeats on every remaining call, so the run
 * must stop. Everything else, contract failures included, is reported and the
 * step abandoned. That is a deliberate divergence from the NauSYS source, where a
 * contract failure is fatal - there every endpoint shares one envelope schema, so
 * a mismatch really does mean the next call will fail too. Here each endpoint
 * carries its own array schema, and `/countries` drifting says nothing about
 * `/yachts`. An abandoned step emits no `scope-complete`, so its records are left
 * active rather than swept away by a dump we only half understood.
 */
/**
 * Where the yacht sweep should start, given a cursor that may predate this scope.
 *
 * Resuming into the wrong list is worse than repeating work: the run reports success
 * having swept nothing, and on a narrowed scope the retire still fires, so a fleet is
 * withdrawn by a run that never looked at it. So the index is trusted only when the
 * company it named is still sitting at it, and a cursor written before this field
 * existed is not trusted at all.
 */
export function resumeCompanyIndex(
  resume: BookingManagerCatalogueCursor | null,
  companyIds: readonly string[],
): number {
  if (resume?.step !== YACHT_STEP || resume.companyIndex === 0) return 0;
  if (resume.companyIndex >= companyIds.length) return 0;
  return companyIds[resume.companyIndex] === resume.companyId ? resume.companyIndex : 0;
}

export async function* syncBookingManagerCatalogue(
  client: BookingManagerClient,
  options: BookingManagerCatalogueOptions = {},
): AsyncIterable<CatalogueSyncEvent> {
  const resume = options.resume ?? null;
  const startStep = resume?.step ?? 0;
  const scope = options.companyScope ?? unscopedCompanies;
  const inScope = (companyId: string) => scope.inScope(companyId);
  let companyIds: string[] = [];

  for (const [index, step] of CATALOGUE_STEPS.entries()) {
    if (index < startStep) continue;

    let items: JsonValue[];
    try {
      items = await step.fetch(client);
    } catch (error) {
      if (isFatal(error)) throw error;
      await options.reporter?.reportError(error, {
        resourceType: step.resourceType,
        context: { endpoint: step.endpoint, step: index },
      });
      continue;
    }

    let malformed = 0;

    for (const item of objectsOf(items)) {
      const externalId = (step.externalIdOf ?? defaultExternalId)(item);
      if (externalId === null) {
        malformed += 1;
        continue;
      }
      // A company outside the scope is skipped rather than emitted, so the sweep
      // that follows this step deactivates it if an earlier, wider run imported it.
      if (index === COMPANY_STEP) {
        if (!inScope(externalId)) continue;
        companyIds.push(externalId);
      }
      yield {
        type: "entity",
        entity: { resourceType: step.resourceType, externalId, payload: item },
      };
    }

    if (malformed > 0) {
      // Reported rather than thrown: the records we did get are worth keeping, but
      // a dump we only partly understood must not authorise a sweep.
      await options.reporter?.reportError(
        new ContractError(
          `Booking Manager ${step.endpoint} returned ${malformed} items without an id`,
          { endpoint: step.endpoint },
        ),
        { resourceType: step.resourceType, context: { endpoint: step.endpoint } },
      );
      continue;
    }

    // No scopeKey: one call covered every scope of this resource type, so a clean
    // response authorises sweeping all of them.
    yield {
      type: "scope-complete",
      resourceType: step.resourceType,
      cursor: { step: index + 1, companyIndex: 0 } satisfies BookingManagerCatalogueCursor,
    };
  }

  if (companyIds.length === 0) {
    // Resuming past the companies dump leaves us without the ids the yacht sweep is
    // addressed by. One extra call is cheaper than restarting the whole run.
    companyIds = (await listCompanyIds(client, options)).filter(inScope);
  }

  const startCompany = resumeCompanyIndex(resume, companyIds);

  for (const [index, companyId] of companyIds.entries()) {
    if (index < startCompany) continue;

    let items: JsonValue[];
    try {
      // `/yachts` takes a companyId filter, so the fleet is swept one operator at a
      // time and a single operator's failure cannot deactivate anyone else's boats.
      items = await client.get(bookingManagerEndpoints.yachts, restYachtListSchema, {
        ...YACHT_QUERY,
        companyId,
      });
    } catch (error) {
      if (isFatal(error)) throw error;
      await options.reporter?.reportError(error, {
        resourceType: "yacht",
        scopeKey: companyId,
        context: { endpoint: bookingManagerEndpoints.yachts, companyIndex: index },
      });
      continue;
    }

    let malformed = 0;

    for (const item of objectsOf(items)) {
      const externalId = idOf(item.id);
      if (externalId === null) {
        malformed += 1;
        continue;
      }
      yield {
        type: "entity",
        entity: { resourceType: "yacht", externalId, scopeKey: companyId, payload: item },
      };
    }

    if (malformed > 0) {
      await options.reporter?.reportError(
        new ContractError(`Booking Manager /yachts returned ${malformed} yachts without an id`, {
          endpoint: bookingManagerEndpoints.yachts,
        }),
        {
          resourceType: "yacht",
          scopeKey: companyId,
          context: { endpoint: bookingManagerEndpoints.yachts },
        },
      );
      continue;
    }

    yield {
      type: "scope-complete",
      resourceType: "yacht",
      scopeKey: companyId,
      cursor: {
        step: YACHT_STEP,
        companyIndex: index + 1,
        // Undefined on the last company, where there is nothing left to point at.
        companyId: companyIds[index + 1],
      } satisfies BookingManagerCatalogueCursor,
    };
  }

  yield* retireOutOfScopeCompanies({
    scope,
    listImportedCompanyIds: options.listImportedCompanyIds,
  });
}

export function bookingManagerCatalogueSource(
  client: BookingManagerClient,
  options: Omit<BookingManagerCatalogueOptions, "reporter"> = {},
): CatalogueSyncSource {
  return (reporter) => syncBookingManagerCatalogue(client, { ...options, reporter });
}

async function listCompanyIds(
  client: BookingManagerClient,
  options: BookingManagerCatalogueOptions,
): Promise<string[]> {
  try {
    const companies = await client.get(bookingManagerEndpoints.companies, restCompanyListSchema);
    return companies.map((company) => idOf(company.id)).filter((id): id is string => id !== null);
  } catch (error) {
    if (isFatal(error)) throw error;
    await options.reporter?.reportError(error, {
      resourceType: "company",
      context: { endpoint: bookingManagerEndpoints.companies },
    });
    return [];
  }
}

/** Only a credential failure repeats identically on every remaining call. */
function isFatal(error: unknown): boolean {
  return error instanceof AuthError;
}

function defaultExternalId(item: JsonObject): string | null {
  return idOf(item.id);
}
