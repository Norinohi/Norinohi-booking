import {
  providerReliabilityInputSchema,
  providerReliabilitySchema,
  syncRunListInputSchema,
  syncRunListSchema,
  syncRunsStartedSchema,
  syncRunStatusInputSchema,
  syncRunStatusSchema,
  syncStartInputSchema,
} from "../../contracts/admin";
import { emptyInputSchema } from "../../contracts/primitives";
import { activeConnectorSchema } from "../../contracts/provider";
import { adminProcedure } from "../../index";
import { providerReliability } from "../../services/provider-reliability";
import {
  getCatalogueSyncStatus,
  listSyncRuns,
  resolveSyncProvider,
  resolveSyncTargets,
  startAvailabilitySync,
  startCatalogueSync,
  startSyncForAll,
} from "../../services/provider-sync";
import { withJsonBodyExample } from "../openapi-examples";

export const providerAdminRouter = {
  capabilities: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/capabilities",
      operationId: "getProviderCapabilities",
      summary: "Get active provider capabilities",
      description:
        "Returns the active inventory provider's supported booking and quote capabilities. Requires an authenticated admin user.",
      tags: ["Admin"],
      successDescription: "Capabilities for the currently configured inventory provider.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(activeConnectorSchema)
    .handler(({ context }) => ({
      provider: context.provider.key,
      ...context.provider.capabilities(),
    })),
  reliability: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/reliability",
      operationId: "getProviderReliability",
      summary: "How each vendor has been answering quote requests",
      description:
        "The share of asks each provider actually answered over the window, and how fast. An answer includes a refusal: the vendor was reached and said the period is gone, which is a fact about the boat rather than a failure of the connector. Only a connection that errored or ran out of time counts against it. Asks our own cached calendar refused before any vendor was called are reported separately, because they measure our data rather than their service. Read-only: nothing in the sale reads these numbers yet.",
      tags: ["Admin"],
      successDescription:
        "One row per provider seen in the window, least reliable first, with the sample each rate rests on.",
      spec: withJsonBodyExample({ windowDays: 30 }),
    })
    .input(providerReliabilityInputSchema)
    .output(providerReliabilitySchema)
    .handler(({ context, input }) => providerReliability(context.db, input)),
  syncCatalogue: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/syncCatalogue",
      operationId: "startProviderCatalogueSync",
      summary: "Start a provider catalogue sync",
      description:
        "Kicks off a full catalogue import and returns immediately with the sync run ids. Omit provider to start every enabled connector, or name one to start just it. A full run can take hours, so it deliberately outlives the request; poll admin.provider.syncStatus to follow it. A provider whose run is already in flight is reported as not started rather than failing the call. Normally this is driven by the scheduled POST /api/cron/sync-catalogue.",
      tags: ["Admin"],
      successDescription: "The sync runs that were opened.",
      spec: withJsonBodyExample({}),
    })
    .input(syncStartInputSchema)
    .output(syncRunsStartedSchema)
    .handler(async ({ context, input }) => ({
      runs: await startSyncForAll(await resolveSyncTargets(input.provider), (provider) =>
        startCatalogueSync(context.db, provider),
      ),
    })),
  syncAvailability: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/syncAvailability",
      operationId: "startProviderAvailabilitySync",
      summary: "Start a provider availability sync",
      description:
        "Refreshes availability and returns immediately with the sync run ids. Omit provider to refresh every enabled connector, or name one. Writes the provider's occupied and option periods, derives the bookable periods around them as unconfirmed availability, and then upgrades as many as its time budget allows to a live confirmed price. Normally driven by the scheduled POST /api/cron/sync-availability; poll admin.provider.syncStatus to follow it.",
      tags: ["Admin"],
      successDescription: "The sync runs that were opened.",
      spec: withJsonBodyExample({}),
    })
    .input(syncStartInputSchema)
    .output(syncRunsStartedSchema)
    .handler(async ({ context, input }) => ({
      runs: await startSyncForAll(await resolveSyncTargets(input.provider), (provider) =>
        startAvailabilitySync(context.db, provider),
      ),
    })),
  syncStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/syncStatus",
      operationId: "getProviderSyncStatus",
      summary: "Read a sync run and its errors",
      description:
        "Returns one sync run with its created/updated/skipped/failed counts and its most recent errors. Omit syncRunId for a provider's latest run, and pass kind to avoid an availability run answering for the catalogue. Defaults to the transacting provider.",
      tags: ["Admin"],
      successDescription: "The requested sync run.",
      spec: withJsonBodyExample({}),
    })
    .input(syncRunStatusInputSchema)
    .output(syncRunStatusSchema)
    .handler(async ({ context, input }) =>
      getCatalogueSyncStatus(
        context.db,
        await resolveSyncProvider(context.provider, input.provider),
        input,
      ),
    ),
  syncRuns: adminProcedure
    .route({
      method: "POST",
      path: "/admin/provider/syncRuns",
      operationId: "listProviderSyncRuns",
      summary: "List sync run history",
      description:
        "Returns past and in-flight sync runs across every provider, newest first, with their created/updated/skipped/failed counts and how many errors each recorded. Filterable by provider, kind and status. syncStatus answers for one run only, so this is where a run that failed overnight and was superseded by the next one is still visible.",
      tags: ["Admin"],
      successDescription: "A page of sync runs.",
      spec: withJsonBodyExample({ kind: "catalogue", page: 1, pageSize: 20 }),
    })
    .input(syncRunListInputSchema)
    .output(syncRunListSchema)
    .handler(({ context, input }) => listSyncRuns(context.db, input)),
};
