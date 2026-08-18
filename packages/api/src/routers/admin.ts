import { ORPCError } from "@orpc/server";
import {
  type InventoryProvider,
  providerCapabilitiesSchema,
  type ProviderKey,
} from "@yacht-charter/providers";

import { getEnabledInventoryProviders } from "../context";

import {
  auditListInputSchema,
  auditListSchema,
  discountCreateInputSchema,
  discountIdInputSchema,
  discountListInputSchema,
  discountListSchema,
  discountSchema,
  discountSetActiveInputSchema,
  discountUpdateInputSchema,
  duplicateConfirmInputSchema,
  duplicateQueueInputSchema,
  duplicateQueueSchema,
  duplicateRejectInputSchema,
  duplicateResolutionSchema,
  listingAdminListInputSchema,
  listingAdminListSchema,
  listingPriceClearInputSchema,
  listingPriceFiltersSchema,
  listingPriceListInputSchema,
  listingPriceListSchema,
  listingPriceRowSchema,
  listingPriceUpdateInputSchema,
  listingPublishDraftsInputSchema,
  listingPublishDraftsSchema,
  listingSetStatusInputSchema,
  listingSetStatusSchema,
  syncRunListInputSchema,
  syncRunListSchema,
  syncRunsStartedSchema,
  syncRunStatusInputSchema,
  syncRunStatusSchema,
  syncStartInputSchema,
  yachtOptionsInputSchema,
  yachtOptionsSchema,
} from "../contracts/admin";
import {
  bookingCancelInputSchema,
  bookingCancelSchema,
  bookingRefundInputSchema,
  bookingRefundSchema,
  invoiceAdminRowSchema,
  invoiceCancelInputSchema,
  invoiceListInputSchema,
  invoiceListSchema,
  invoiceSettleInputSchema,
  invoiceSettleSchema,
} from "../contracts/booking";
import { emptyInputSchema } from "../contracts/primitives";
import { sweepResultSchema } from "../contracts/maintenance";
import {
  leadListInputSchema,
  leadListSchema,
  leadSchema,
  leadSetStatusInputSchema,
} from "../contracts/lead";
import { adminProcedure } from "../index";
import { listAuditLog } from "../services/audit";
import {
  confirmDuplicateCandidate,
  listDuplicateCandidates,
  rejectDuplicateCandidate,
} from "../services/match";
import { cancelBooking } from "../services/booking";
import { refundBooking } from "../services/refund";
import {
  cancelInvoiceRequest,
  listInvoiceRequests,
  settleInvoiceRequest,
} from "../services/invoice";
import { sweepExpiries } from "../services/expiry";
import { listLeads, setLeadStatus } from "../services/lead";
import {
  createDiscount,
  getDiscount,
  listDiscounts,
  setDiscountActive,
  updateDiscount,
} from "../services/discount-admin";
import {
  listAdminListings,
  publishListingDrafts,
  setListingStatus,
} from "../services/listing-admin";
import { listYachtOptions } from "../services/listing-options";
import {
  getCatalogueSyncStatus,
  listSyncRuns,
  startAvailabilitySync,
  startCatalogueSync,
  startSyncForAll,
} from "../services/provider-sync";
import {
  clearListingPrice,
  listListingPriceFilters,
  listListingPrices,
  updateListingPrice,
} from "../services/listing-price";
import { withJsonBodyExample } from "./openapi-examples";

/**
 * Which providers a sync request targets: the one named, or every enabled one.
 *
 * `context.provider` is not the answer here. It is whichever adapter
 * `PROVIDER_MODE` selected for quoting and checkout, and importing from a vendor
 * is a separate question from selling through it.
 */
async function resolveSyncTargets(
  requested: ProviderKey | undefined,
): Promise<InventoryProvider[]> {
  const providers = await getEnabledInventoryProviders();
  if (!requested) return [...providers.values()];

  const target = providers.get(requested);
  if (!target) {
    throw new ORPCError("NOT_FOUND", {
      message: `Provider "${requested}" is not enabled`,
    });
  }
  return [target];
}

async function resolveSyncProvider(
  context: { provider: InventoryProvider },
  requested: ProviderKey | undefined,
): Promise<InventoryProvider> {
  if (!requested) return context.provider;
  const [only] = await resolveSyncTargets(requested);
  return only ?? context.provider;
}

export const adminRouter = {
  provider: {
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
      .output(providerCapabilitiesSchema)
      .handler(({ context }) => context.provider.capabilities()),
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
          await resolveSyncProvider(context, input.provider),
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
  },
  match: {
    queue: adminProcedure
      .route({
        method: "POST",
        path: "/admin/match/queue",
        operationId: "listDuplicateCandidates",
        summary: "List duplicate candidates awaiting review",
        description:
          "Cross-provider look-alikes proposed by the catalogue sync, highest confidence first. Each row hydrates both sides — provider, operator, model, year, length, cabins, berths, base and primary image — so the pair can be judged without opening two tabs. Nothing merges automatically; until a candidate is resolved the same yacht appears twice in search. Pass decision to read the confirmed or rejected history instead.",
        tags: ["Admin"],
        successDescription: "A page of duplicate candidates.",
        spec: withJsonBodyExample({ decision: "pending", page: 1, pageSize: 20 }),
      })
      .input(duplicateQueueInputSchema)
      .output(duplicateQueueSchema)
      .handler(({ context, input }) => listDuplicateCandidates(context.db, input)),
    confirm: adminProcedure
      .route({
        method: "POST",
        path: "/admin/match/confirm",
        operationId: "confirmDuplicateCandidate",
        summary: "Merge a duplicate pair onto one listing",
        description:
          "Merges the pair onto keepListingId: every listing_source of the other listing is repointed at the survivor, both sources are stamped confirmed so the next sync will not undo the verdict, and the losing listing is hidden rather than deleted because bookings still reference it. Rejects a candidate that has already been reviewed with CONFLICT, so a double-click cannot merge twice. Rebuilds the search document afterwards and writes an audit log entry carrying both listing ids.",
        tags: ["Admin"],
        successDescription: "Which listing survived and what moved.",
        spec: withJsonBodyExample({
          candidateId: "ldup_example",
          keepListingId: "ylst_yacht-sunreef-60-celeste",
        }),
      })
      .input(duplicateConfirmInputSchema)
      .output(duplicateResolutionSchema)
      .handler(({ context, input }) =>
        confirmDuplicateCandidate(context.db, context.session.user.id, input),
      ),
    reject: adminProcedure
      .route({
        method: "POST",
        path: "/admin/match/reject",
        operationId: "rejectDuplicateCandidate",
        summary: "Record that a duplicate pair is two different yachts",
        description:
          "Closes the candidate and moves both sources to rejected, which stops the sync re-proposing the pair and leaves each listing exactly where it is. Rejects an already-reviewed candidate with CONFLICT. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The rejected candidate.",
        spec: withJsonBodyExample({ candidateId: "ldup_example" }),
      })
      .input(duplicateRejectInputSchema)
      .output(duplicateResolutionSchema)
      .handler(({ context, input }) =>
        rejectDuplicateCandidate(context.db, context.session.user.id, input.candidateId),
      ),
  },
  audit: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/audit/list",
        operationId: "listAuditLog",
        summary: "Read the admin audit log",
        description:
          "Returns audit entries newest first with the actor's name and email, filterable by entityType, entityId and action. Every admin mutation writes one; this is the only way to see them after the fact, including which listings a merge combined.",
        tags: ["Admin"],
        successDescription: "A page of audit entries.",
        spec: withJsonBodyExample({
          entityType: "listing",
          action: "merge",
          page: 1,
          pageSize: 20,
        }),
      })
      .input(auditListInputSchema)
      .output(auditListSchema)
      .handler(({ context, input }) => listAuditLog(context.db, input)),
  },
  booking: {
    cancel: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/cancel",
        operationId: "adminCancelBooking",
        summary: "Cancel any booking",
        description:
          "Cancels a booking on behalf of a customer, including a confirmed one — a confirmed booking moves to REFUND_PENDING so the money is returned rather than being silently dropped. Requires an authenticated admin user.",
        tags: ["Admin"],
        successDescription: "The booking's status after cancellation.",
        spec: withJsonBodyExample({ id: "bkg_example", reason: "Operator withdrew the yacht" }),
      })
      .input(bookingCancelInputSchema)
      .output(bookingCancelSchema)
      .handler(({ context, input }) =>
        cancelBooking(context.db, context.provider, input.id, input.reason, {
          userId: context.session.user.id,
          isAdmin: true,
        }),
      ),
    refund: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/refund",
        operationId: "adminRefundBooking",
        summary: "Return the money on a booking that owes a refund",
        description:
          "Refunds every payment collected on a booking sitting at REFUND_PENDING, then moves it to REFUNDED once nothing is outstanding. Card payments go back through Stripe; a bank transfer cannot, so those are reported in requiresManualTransfer and only count as returned when staff resend the money and pass manualTransferSettled. Idempotent and keyed per payment — running it again finishes a partial refund rather than paying twice. A provider rejection refunds itself; this is for the admin-cancelled case and for retries. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "What was returned and the booking's resulting status.",
        spec: withJsonBodyExample({ id: "bkg_example", reason: "Operator withdrew the yacht" }),
      })
      .input(bookingRefundInputSchema)
      .output(bookingRefundSchema)
      .handler(({ context, input }) =>
        refundBooking(context.db, input.id, {
          reason: input.reason,
          manualTransferSettled: input.manualTransferSettled,
          actorUserId: context.session.user.id,
        }),
      ),
  },
  invoice: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/invoice/list",
        operationId: "listInvoiceRequests",
        summary: "List bank-transfer invoice requests",
        description:
          "Customers who chose Request invoice instead of paying by card. Their bookings sit at PAYMENT_PENDING until someone settles the transfer here — this is the only place those requests are visible.",
        tags: ["Admin"],
        successDescription: "A page of invoice requests.",
        spec: withJsonBodyExample({ status: "pending", page: 1, pageSize: 20 }),
      })
      .input(invoiceListInputSchema)
      .output(invoiceListSchema)
      .handler(({ context, input }) => listInvoiceRequests(context.db, input)),
    settle: adminProcedure
      .route({
        method: "POST",
        path: "/admin/invoice/settle",
        operationId: "settleInvoiceRequest",
        summary: "Record a received bank transfer",
        description:
          "Marks the transfer as received and then commits the booking with the provider through the same path a card payment takes. Idempotent: settling twice does not re-record the payment or re-confirm. A provider refusal is reported in providerRejection rather than thrown — the money did arrive, so the settlement stands and the booking moves to REFUND_PENDING. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The settled invoice and the booking's resulting status.",
        spec: withJsonBodyExample({ id: "inv_example", note: "Transfer received" }),
      })
      .input(invoiceSettleInputSchema)
      .output(invoiceSettleSchema)
      .handler(({ context, input }) =>
        settleInvoiceRequest(context.db, context.provider, context.session.user.id, input),
      ),
    cancel: adminProcedure
      .route({
        method: "POST",
        path: "/admin/invoice/cancel",
        operationId: "cancelInvoiceRequest",
        summary: "Withdraw an unpaid invoice request",
        description:
          "Cancels an invoice that will not be paid and cancels the booking waiting on it, so the provider option is not held for nothing. Refuses once the invoice has been settled — cancel the booking instead, which routes it to a refund. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The cancelled invoice request.",
        spec: withJsonBodyExample({ id: "inv_example", reason: "No response from customer" }),
      })
      .input(invoiceCancelInputSchema)
      .output(invoiceAdminRowSchema)
      .handler(({ context, input }) =>
        cancelInvoiceRequest(context.db, context.session.user.id, input.id, input.reason),
      ),
  },
  maintenance: {
    sweepExpiries: adminProcedure
      .route({
        method: "POST",
        path: "/admin/maintenance/sweepExpiries",
        operationId: "sweepExpiries",
        summary: "Expire stale quotes and provider holds",
        description:
          "Runs the expiry sweep by hand. Normally this is driven by the scheduled POST /api/cron/sweep-expiries; this exists so staff can clear a stuck slot without waiting for the next run. Idempotent — running it twice changes nothing the second time.",
        tags: ["Admin"],
        successDescription: "What the sweep changed.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(sweepResultSchema)
      .handler(({ context }) => sweepExpiries(context.db, context.provider)),
  },
  lead: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/lead/list",
        operationId: "listLeads",
        summary: "List pre-booking enquiries",
        description:
          "Returns enquiries from Request Quote, Contact a charter expert, and Get Consultation, newest first, filterable by kind and status. This is the only way anyone sees them — nothing is emailed.",
        tags: ["Admin"],
        successDescription: "A page of enquiries.",
        spec: withJsonBodyExample({ status: "new", page: 1, pageSize: 20 }),
      })
      .input(leadListInputSchema)
      .output(leadListSchema)
      .handler(({ context, input }) => listLeads(context.db, input)),
    setStatus: adminProcedure
      .route({
        method: "POST",
        path: "/admin/lead/setStatus",
        operationId: "setLeadStatus",
        summary: "Move an enquiry through the pipeline",
        description:
          "Marks an enquiry as contacted or closed and records who handled it. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The enquiry with its new status.",
        spec: withJsonBodyExample({ id: "lead_example", status: "contacted" }),
      })
      .input(leadSetStatusInputSchema)
      .output(leadSchema)
      .handler(({ context, input }) =>
        setLeadStatus(context.db, context.session.user.id, input.id, input.status),
      ),
  },
  discount: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/list",
        operationId: "listDiscounts",
        summary: "List promo codes",
        description:
          "Returns promo codes for the staff Discount Manager, newest first, with the derived status (active, scheduled, expired, inactive), the redemption count against the usage limit, and a rendered 'Applies to' label.",
        tags: ["Admin"],
        successDescription: "A page of promo codes.",
        spec: withJsonBodyExample({ page: 1, pageSize: 10 }),
      })
      .input(discountListInputSchema)
      .output(discountListSchema)
      .handler(({ context, input }) => listDiscounts(context.db, input)),
    get: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/get",
        operationId: "getDiscount",
        summary: "Get one promo code",
        description: "Returns a single promo code with its targets, for the edit modal.",
        tags: ["Admin"],
        successDescription: "The requested promo code.",
        spec: withJsonBodyExample({ id: "dsc_example" }),
      })
      .input(discountIdInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => getDiscount(context.db, input.id)),
    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/create",
        operationId: "createDiscount",
        summary: "Create a promo code",
        description:
          "Creates a promo code and its targets. A percentage discount requires valuePct; a fixed discount requires valueMinor and currency. Codes are stored upper-cased and must be unique. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The created promo code.",
        spec: withJsonBodyExample({
          name: "Summer View 2026",
          code: "SUMMER2026",
          type: "percentage",
          valuePct: 10,
          startsAt: "2026-07-07",
          endsAt: "2026-07-30",
          usageLimit: 100,
          targets: [{ targetType: "all" }],
        }),
      })
      .input(discountCreateInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => createDiscount(context.db, context.session.user.id, input)),
    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/update",
        operationId: "updateDiscount",
        summary: "Update a promo code",
        description:
          "Updates the supplied fields of a promo code. Targets, when present, replace the existing set wholesale. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The updated promo code.",
        spec: withJsonBodyExample({
          id: "dsc_example",
          name: "Summer View 2026",
          valuePct: 25,
        }),
      })
      .input(discountUpdateInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) => updateDiscount(context.db, context.session.user.id, input)),
    setActive: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/setActive",
        operationId: "setDiscountActive",
        summary: "Activate or deactivate a promo code",
        description:
          "Flips a promo code's active flag. Deactivating is preferred over deleting so existing redemptions keep their reference. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The promo code with its new active state.",
        spec: withJsonBodyExample({ id: "dsc_example", active: false }),
      })
      .input(discountSetActiveInputSchema)
      .output(discountSchema)
      .handler(({ context, input }) =>
        setDiscountActive(context.db, context.session.user.id, input.id, input.active),
      ),
    yachtOptions: adminProcedure
      .route({
        method: "POST",
        path: "/admin/discount/yachtOptions",
        operationId: "listDiscountYachtOptions",
        summary: "Search yachts for discount targeting",
        description:
          "Returns listings matching a name search, for the 'Specific Yachts' picker in the create/edit modal.",
        tags: ["Admin"],
        successDescription: "Matching listings.",
        spec: withJsonBodyExample({ query: "Bavaria", limit: 20 }),
      })
      .input(yachtOptionsInputSchema)
      .output(yachtOptionsSchema)
      .handler(({ context, input }) => listYachtOptions(context.db, input)),
  },
  listing: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing/list",
        operationId: "listAdminListings",
        summary: "List the catalogue including unpublished listings",
        description:
          "Every listing staff can act on, newest first, drafts included. Filter by provider, by status, and by a case-insensitive substring of the title or slug. Rows carry the operator, model, year, base and location, the primary image, and the cheapest available price when availability has been synced. Public search shows published listings only, so this is the only place an imported draft is visible.",
        tags: ["Admin"],
        successDescription: "A page of listings.",
        spec: withJsonBodyExample({
          provider: "booking_manager",
          status: "draft",
          page: 1,
          pageSize: 20,
        }),
      })
      .input(listingAdminListInputSchema)
      .output(listingAdminListSchema)
      .handler(({ context, input }) => listAdminListings(context.db, input)),
    setStatus: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing/setStatus",
        operationId: "setListingStatus",
        summary: "Publish, hide or unpublish one listing",
        description:
          "Moves a single listing between draft, published and hidden, and rebuilds its search document so the change shows up in search immediately: publishing writes the document, draft and hidden remove it. Writes an audit log entry carrying the status before and after.",
        tags: ["Admin"],
        successDescription: "The listing with its new status.",
        spec: withJsonBodyExample({
          id: "ylst_yacht-sunreef-60-celeste",
          status: "published",
        }),
      })
      .input(listingSetStatusInputSchema)
      .output(listingSetStatusSchema)
      .handler(({ context, input }) =>
        setListingStatus(context.db, context.session.user.id, input),
      ),
    publishDrafts: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing/publishDrafts",
        operationId: "publishListingDrafts",
        summary: "Publish a provider's imported drafts in bulk",
        description:
          "Publishes every listing still sitting at draft within the given scope and rebuilds their search documents. provider is that scope, NOT a filter on the response: naming a provider releases only its drafts, while OMITTING provider PUBLISHES EVERY PROVIDER'S DRAFTS IN THE ENTIRE CATALOGUE IN ONE CALL. Syncs import as draft so unreviewed vendor inventory never reaches customers; an unscoped call undoes that everywhere at once, which in production is thousands of unreviewed yachts. Pass a provider unless releasing the whole catalogue is exactly what is meant. Writes one audit log entry recording the scope and the count.",
        tags: ["Admin"],
        successDescription: "How many drafts were published.",
        spec: withJsonBodyExample({ provider: "booking_manager" }),
      })
      .input(listingPublishDraftsInputSchema)
      .output(listingPublishDraftsSchema)
      .handler(({ context, input }) =>
        publishListingDrafts(context.db, context.session.user.id, input),
      ),
  },
  listingPrice: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing-price/list",
        operationId: "listListingPrices",
        summary: "List listing base and current prices",
        description:
          "Returns one row per listing for the Manage Prices table: the provider's recommended price alongside the price after the active manual override, plus the rule responsible for the difference.",
        tags: ["Admin"],
        successDescription: "A page of listing prices.",
        spec: withJsonBodyExample({ query: "Bavaria", page: 1, pageSize: 10 }),
      })
      .input(listingPriceListInputSchema)
      .output(listingPriceListSchema)
      .handler(({ context, input }) => listListingPrices(context.db, input)),
    filters: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing-price/filters",
        operationId: "listListingPriceFilters",
        summary: "List Manage Prices filter options",
        description:
          "Returns the yacht categories and locations present in the catalogue, for the 'All types' and 'All locations' dropdowns.",
        tags: ["Admin"],
        successDescription: "Filter options for the Manage Prices table.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(listingPriceFiltersSchema)
      .handler(({ context }) => listListingPriceFilters(context.db)),
    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing-price/update",
        operationId: "updateListingPrice",
        summary: "Override a listing's price",
        description:
          "Sets an absolute price for one listing by creating a non-stackable, listing-scoped price adjustment rule and deactivating any previous manual override. startsAt and endsAt scope the override to part of the season; omit both for an open-ended override. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The listing row with its new current price.",
        spec: withJsonBodyExample({
          listingId: "ylst_yacht-sunreef-60-celeste",
          newPriceMinor: 1_159_900,
          currency: "EUR",
          startsAt: "2026-07-01",
          endsAt: "2026-08-31",
        }),
      })
      .input(listingPriceUpdateInputSchema)
      .output(listingPriceRowSchema)
      .handler(({ context, input }) =>
        updateListingPrice(context.db, context.session.user.id, input),
      ),
    clear: adminProcedure
      .route({
        method: "POST",
        path: "/admin/listing-price/clear",
        operationId: "clearListingPrice",
        summary: "Remove a listing's price override",
        description:
          "Deactivates the manual override for one listing so it falls back to the provider's recommended price. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The listing row back at its provider price.",
        spec: withJsonBodyExample({ listingId: "ylst_yacht-sunreef-60-celeste" }),
      })
      .input(listingPriceClearInputSchema)
      .output(listingPriceRowSchema)
      .handler(({ context, input }) =>
        clearListingPrice(context.db, context.session.user.id, input.listingId),
      ),
  },
};
