import { z } from "zod";

import { AuthError, ContractError } from "../shared/errors";
import { idOf, objectsOf } from "../shared/projection-helpers";
import type { CatalogueSyncEvent, CatalogueSyncSource, SyncReporter } from "../sync/runner";
import type { ProviderResourceType } from "../types";
import type { NausysClient } from "./client";
import { nausysEndpoints } from "./endpoints";

/**
 * Ingest deliberately parses no further than the envelope and the collection.
 * Every catalogue dump is retained raw and validated in `projection.ts`; a vendor
 * that adds a field to `RestYacht` between minor releases must not stop the
 * nightly sync.
 */
const dumpSchema = z.looseObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
});

type Dump = z.infer<typeof dumpSchema>;

interface CatalogueStep {
  resourceType: ProviderResourceType;
  endpoint: string;
  /**
   * Collection keys in preference order, taken from responses recorded against
   * production. The vendor names them inconsistently and twice does not name them
   * after the endpoint at all (`countrystates` answers under `countries`,
   * `discountItems` under `discounts`), so the first array in the body stays the
   * fallback for an endpoint that is renamed later.
   */
  collectionKeys: string[];
  scopeKeyOf?: (item: Record<string, unknown>) => string | undefined;
}

const companyScope = (item: Record<string, unknown>) => idOf(item.companyId) ?? undefined;

/**
 * FK order, not vendor order. Projection cross-references records that arrived in
 * earlier batches, and `amenity.amenity_category_id` is NOT NULL, so equipment
 * categories must land before equipment.
 */
const CATALOGUE_STEPS: CatalogueStep[] = [
  {
    resourceType: "country",
    endpoint: nausysEndpoints.catalogue.countries,
    collectionKeys: ["countries"],
  },
  {
    resourceType: "country_state",
    endpoint: nausysEndpoints.catalogue.countryStates,
    collectionKeys: ["countries"],
  },
  {
    resourceType: "region",
    endpoint: nausysEndpoints.catalogue.regions,
    collectionKeys: ["regions"],
  },
  {
    resourceType: "location",
    endpoint: nausysEndpoints.catalogue.locations,
    collectionKeys: ["locations"],
  },
  {
    resourceType: "company",
    endpoint: nausysEndpoints.catalogue.charterCompanies,
    collectionKeys: ["companies", "charterCompanies"],
  },
  {
    resourceType: "base",
    endpoint: nausysEndpoints.catalogue.charterBases,
    collectionKeys: ["bases", "charterBases"],
    scopeKeyOf: companyScope,
  },
  {
    resourceType: "builder",
    endpoint: nausysEndpoints.catalogue.yachtBuilders,
    collectionKeys: ["builders", "yachtBuilders"],
  },
  {
    resourceType: "model",
    endpoint: nausysEndpoints.catalogue.yachtModels,
    collectionKeys: ["models", "yachtModels"],
  },
  {
    resourceType: "category",
    endpoint: nausysEndpoints.catalogue.yachtCategories,
    collectionKeys: ["categories", "yachtCategories"],
  },
  {
    resourceType: "sail_type",
    endpoint: nausysEndpoints.catalogue.sailTypes,
    collectionKeys: ["sailTypes"],
  },
  {
    resourceType: "steering_type",
    endpoint: nausysEndpoints.catalogue.steeringTypes,
    collectionKeys: ["steeringTypes"],
  },
  {
    resourceType: "engine_builder",
    endpoint: nausysEndpoints.catalogue.engineBuilders,
    collectionKeys: ["engineBuilders", "builders"],
  },
  {
    resourceType: "equipment_category",
    endpoint: nausysEndpoints.catalogue.equipmentCategories,
    collectionKeys: ["equipmentCategories"],
  },
  {
    resourceType: "amenity",
    endpoint: nausysEndpoints.catalogue.equipment,
    collectionKeys: ["equipment"],
  },
  {
    resourceType: "service",
    endpoint: nausysEndpoints.catalogue.services,
    collectionKeys: ["services"],
  },
  {
    resourceType: "price_measure",
    endpoint: nausysEndpoints.catalogue.priceMeasures,
    collectionKeys: ["priceMeasures"],
  },
  {
    resourceType: "season",
    endpoint: nausysEndpoints.catalogue.seasons,
    collectionKeys: ["seasons"],
  },
  {
    resourceType: "price_list",
    endpoint: nausysEndpoints.catalogue.priceLists,
    collectionKeys: ["priceLists"],
  },
  {
    resourceType: "discount_item",
    endpoint: nausysEndpoints.catalogue.discountItems,
    collectionKeys: ["discounts"],
  },
];

/** The per-company yacht sweep, addressed as one more step so the cursor is flat. */
const YACHT_STEP = CATALOGUE_STEPS.length;

const COMPANY_STEP = CATALOGUE_STEPS.findIndex((step) => step.resourceType === "company");

export interface NausysCatalogueCursor {
  step: number;
  companyIndex?: number;
}

export function parseNausysCatalogueCursor(value: unknown): NausysCatalogueCursor | null {
  const parsed = z
    .object({
      step: z.number().int().min(0).max(YACHT_STEP),
      companyIndex: z.number().int().min(0).optional(),
    })
    .safeParse(value);

  return parsed.success ? parsed.data : null;
}

export interface NausysCatalogueOptions {
  resume?: NausysCatalogueCursor | null;
  /**
   * Companies to sweep for yachts. Supplied when a resume skipped the companies
   * dump; otherwise the ids come from that dump.
   */
  companyIds?: string[];
  /** Recoverable failures go here so the stream survives them; see below. */
  reporter?: Pick<SyncReporter, "reportError">;
}

/**
 * The whole NauSYS catalogue as an event stream.
 *
 * Two failure modes, deliberately different. An auth or contract failure is thrown:
 * it will repeat on every remaining call, so the run must stop. Anything else is
 * reported and the step is abandoned, which leaves that scope without its
 * completion event and therefore unswept. That is the design: one company's network
 * failure loses that company's refresh, not its fleet.
 */
export async function* syncNausysCatalogue(
  client: NausysClient,
  options: NausysCatalogueOptions = {},
): AsyncIterable<CatalogueSyncEvent> {
  const resume = options.resume ?? null;
  const startStep = resume?.step ?? 0;
  let companyIds = options.companyIds ?? [];

  for (const [index, step] of CATALOGUE_STEPS.entries()) {
    if (index < startStep) continue;

    let dump: Dump;
    try {
      dump = await client.catalogueCall(step.endpoint, dumpSchema);
    } catch (error) {
      if (isFatal(error)) throw error;
      await options.reporter?.reportError(error, {
        resourceType: step.resourceType,
        context: { endpoint: step.endpoint, step: index },
      });
      continue;
    }

    const items = collectionOf(dump, step.collectionKeys, step.endpoint);
    let malformed = 0;

    for (const item of items) {
      const externalId = idOf(item.id);
      if (externalId === null) {
        malformed += 1;
        continue;
      }
      yield {
        type: "entity",
        entity: {
          resourceType: step.resourceType,
          externalId,
          scopeKey: step.scopeKeyOf?.(item),
          payload: item,
        },
      };
      if (index === COMPANY_STEP) {
        companyIds.push(externalId);
      }
    }

    if (malformed > 0) {
      // Reported rather than thrown: the records we did get are still worth keeping,
      // but a dump we only partly understood must not authorise a sweep.
      await options.reporter?.reportError(
        new ContractError(`NauSYS ${step.endpoint} returned ${malformed} items without an id`, {
          endpoint: step.endpoint,
        }),
        { resourceType: step.resourceType, context: { endpoint: step.endpoint } },
      );
      continue;
    }

    // No scopeKey: one call covered every scope of this resource type, so a clean
    // response authorises sweeping all of them.
    yield {
      type: "scope-complete",
      resourceType: step.resourceType,
      cursor: { step: index + 1 } satisfies NausysCatalogueCursor,
    };
  }

  if (companyIds.length === 0) {
    // Resuming past the companies dump leaves us without the ids the yacht sweep is
    // addressed by. One extra call is cheaper than restarting a multi-hour run.
    companyIds = await listCompanyIds(client, options);
  }

  const startCompany = resume?.step === YACHT_STEP ? (resume.companyIndex ?? 0) : 0;

  for (const [index, companyId] of companyIds.entries()) {
    if (index < startCompany) continue;

    const endpoint = nausysEndpoints.catalogue.yachts(companyId);
    let dump: Dump;
    try {
      // Strictly sequential, one company at a time: the vendor forbids parallel
      // calls, and the client's queue would serialise them anyway.
      dump = await client.catalogueCall(endpoint, dumpSchema);
    } catch (error) {
      if (isFatal(error)) throw error;
      await options.reporter?.reportError(error, {
        resourceType: "yacht",
        scopeKey: companyId,
        context: { endpoint, companyIndex: index },
      });
      continue;
    }

    // Named explicitly, never left to the fallback: this dump also carries
    // `yachtIDs`, an array of bare numbers that comes first and would be selected
    // instead, yielding a fleet of zero yachts.
    const items = collectionOf(dump, ["yachts"], endpoint);
    let malformed = 0;

    for (const item of items) {
      const externalId = idOf(item.id);
      if (externalId === null) {
        malformed += 1;
        continue;
      }
      yield {
        type: "entity",
        entity: {
          resourceType: "yacht",
          externalId,
          scopeKey: companyId,
          payload: item,
        },
      };
    }

    if (malformed > 0) {
      await options.reporter?.reportError(
        new ContractError(`NauSYS ${endpoint} returned ${malformed} yachts without an id`, {
          endpoint,
        }),
        { resourceType: "yacht", scopeKey: companyId, context: { endpoint } },
      );
      continue;
    }

    yield {
      type: "scope-complete",
      resourceType: "yacht",
      scopeKey: companyId,
      cursor: { step: YACHT_STEP, companyIndex: index + 1 } satisfies NausysCatalogueCursor,
    };
  }
}

export function nausysCatalogueSource(
  client: NausysClient,
  options: Omit<NausysCatalogueOptions, "reporter"> = {},
): CatalogueSyncSource {
  return (reporter) => syncNausysCatalogue(client, { ...options, reporter });
}

async function listCompanyIds(
  client: NausysClient,
  options: NausysCatalogueOptions,
): Promise<string[]> {
  const step = CATALOGUE_STEPS[COMPANY_STEP];
  if (!step) return [];

  try {
    const dump = await client.catalogueCall(step.endpoint, dumpSchema);
    return collectionOf(dump, step.collectionKeys, step.endpoint)
      .map((item) => idOf(item.id))
      .filter((id): id is string => id !== null);
  } catch (error) {
    if (isFatal(error)) throw error;
    await options.reporter?.reportError(error, {
      resourceType: "company",
      context: { endpoint: step.endpoint },
    });
    return [];
  }
}

/** These repeat identically on every remaining call, so the run must stop. */
function isFatal(error: unknown): boolean {
  return error instanceof AuthError || error instanceof ContractError;
}

function collectionOf(dump: Dump, keys: string[], endpoint: string): Record<string, unknown>[] {
  const body = dump as Record<string, unknown>;

  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return objectsOf(value);
  }

  const fallback = Object.entries(body).find(
    ([key, value]) => key !== "status" && Array.isArray(value),
  );
  if (fallback) return objectsOf(fallback[1] as unknown[]);

  // An OK response carrying no collection at all is a contract violation, and the
  // only reading that is definitely wrong is "the vendor has nothing" — which would
  // sweep the entire resource type away.
  throw new ContractError(`NauSYS ${endpoint} returned no collection`, {
    endpoint,
    payload: { keys: Object.keys(body) },
  });
}
