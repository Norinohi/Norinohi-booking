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
  adminBookingIdInputSchema,
  bookingAdminDetailSchema,
  bookingAdminListInputSchema,
  bookingAdminListSchema,
  bookingCancelInputSchema,
  bookingCancelSchema,
  bookingExcludeByCompanyInputSchema,
  bookingExcludeByCompanySchema,
  bookingExcludeInputSchema,
  bookingExcludeSchema,
  bookingRefundInputSchema,
  bookingRefundSchema,
  invoiceAdminRowSchema,
  invoiceCancelInputSchema,
  invoiceListInputSchema,
  invoiceListSchema,
  invoiceSettleInputSchema,
  invoiceSettleSchema,
} from "../contracts/booking";
import {
  enquiryAnswerInputSchema,
  enquiryListInputSchema,
  enquiryListSchema,
  enquiryRowSchema,
  enquirySetStatusInputSchema,
} from "../contracts/enquiry";
import { emptyInputSchema } from "../contracts/primitives";
import {
  outboxDrainResultSchema,
  reminderResultSchema,
  sweepResultSchema,
} from "../contracts/maintenance";
import {
  leadAnswerInputSchema,
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
import {
  excludeBookingsByCompany,
  getBookingForAdmin,
  listBookingsForAdmin,
  setBookingExcluded,
} from "../services/booking-admin";
import { refundBooking } from "../services/refund";
import {
  cancelInvoiceRequest,
  listInvoiceRequests,
  settleInvoiceRequest,
} from "../services/invoice";
import { sweepExpiries } from "../services/expiry";
import { sendBalanceReminders } from "../services/payment-reminders";
import { drainOutbox } from "../services/outbox";
import { answerLead, listLeads, setLeadStatus } from "../services/lead";
import { answerEnquiry, listEnquiries, setEnquiryStatus } from "../services/enquiry";
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
import { providerForBooking } from "../services/provider-routing";
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
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/list",
        operationId: "listBookingsForAdmin",
        summary: "List bookings across every customer",
        description:
          'The staff view of the booking table, filterable by status and searchable by reference, customer name or email. Carries the customer and the money actually collected rather than the listing card the customer\'s own history shows. Passing status: ["REFUND_PENDING"] is the refund queue — bookings whose money is owed back and which nothing else surfaces.',
        tags: ["Admin"],
        successDescription: "A page of bookings.",
        spec: withJsonBodyExample({ status: ["REFUND_PENDING"], page: 1, pageSize: 20 }),
      })
      .input(bookingAdminListInputSchema)
      .output(bookingAdminListSchema)
      .handler(({ context, input }) => listBookingsForAdmin(context.db, input)),
    get: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/get",
        operationId: "getBookingForAdmin",
        summary: "Read any booking, regardless of owner",
        description:
          "The staff view of one booking: the customer it belongs to, the provider reservation, every price line, the payment schedule, and each payment with how it arrived and whether it is disputed. booking.get is scoped to the session user and answers NOT_FOUND for anyone else — correct for a customer, which is why staff need this. Travellers are deliberately absent here too: passport and crew data stays behind booking.travellers.*.",
        tags: ["Admin"],
        successDescription: "The booking.",
        spec: withJsonBodyExample({ id: "bkg_example" }),
      })
      .input(adminBookingIdInputSchema)
      .output(bookingAdminDetailSchema)
      .handler(({ context, input }) => getBookingForAdmin(context.db, input.id)),
    setExcluded: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/set-excluded",
        operationId: "setBookingExcluded",
        summary: "Mark a booking as not real business, or put it back",
        description:
          "Marks a booking as test data, so the staff queues and the money totals stop counting it. Nothing about the booking moves: the status, the payments and the provider reservation are untouched, and the customer still sees it in their own history. This is for a reservation that was never real — typically one made against a vendor's test charter company to prove the flow works. A booking that was real and is not happening should be cancelled instead. Reversible: pass excluded: false. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The booking's exclusion after the change.",
        spec: withJsonBodyExample({
          id: "bkg_example",
          excluded: true,
          reason: "Test booking against the vendor's test company",
        }),
      })
      .input(bookingExcludeInputSchema)
      .output(bookingExcludeSchema)
      .handler(({ context, input }) =>
        setBookingExcluded(context.db, input, context.session.user.id),
      ),
    excludeByCompany: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/exclude-by-company",
        operationId: "excludeBookingsByCompany",
        summary: "Mark every booking against one charter company as not real business",
        description:
          "The bulk form of booking.setExcluded, scoped to one provider's charter company id. Written for the case it names: a vendor's test charter company is imported, bookings are made against its yachts to prove checkout works, and afterwards there is no way to say none of that was real without clicking through each one. Scoped by the provider's own company id rather than by anything of ours, so it keeps working after the company's listings have been hidden by the import scope. Dry by default — apply: false reports exactly which references would be excluded and changes nothing.",
        tags: ["Admin"],
        successDescription: "What matched, and whether it was applied.",
        spec: withJsonBodyExample({
          provider: "booking_manager",
          externalCompanyId: "225",
          apply: false,
        }),
      })
      .input(bookingExcludeByCompanyInputSchema)
      .output(bookingExcludeByCompanySchema)
      .handler(({ context, input }) =>
        excludeBookingsByCompany(context.db, input, context.session.user.id),
      ),
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
      .handler(async ({ context, input }) =>
        cancelBooking(
          context.db,
          await providerForBooking(context.db, context.provider, input.id),
          input.id,
          input.reason,
          {
            userId: context.session.user.id,
            isAdmin: true,
          },
        ),
      ),
    refund: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/refund",
        operationId: "adminRefundBooking",
        summary: "Return the money on a booking that owes a refund",
        description:
          "Refunds a booking sitting at REFUND_PENDING, then moves it to REFUNDED once nothing is outstanding. Pass amountMinor to return part of the money — what a cancellation policy retains is a decision staff make until one is modelled — or omit it to return everything collected. Card money is allocated first and goes back through Stripe; a bank transfer cannot, so those are reported in requiresManualTransfer and only count as returned when staff resend the money and pass manualTransferSettled. Every refund is recorded before Stripe is called and keyed on that record, so a retry finishes the job rather than paying twice and a partial refund can be topped up later. A provider rejection refunds itself; this is for the admin-cancelled case and for retries. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "What was returned and the booking's resulting status.",
        spec: withJsonBodyExample({ id: "bkg_example", reason: "Operator withdrew the yacht" }),
      })
      .input(bookingRefundInputSchema)
      .output(bookingRefundSchema)
      .handler(({ context, input }) =>
        refundBooking(context.db, input.id, {
          amountMinor: input.amountMinor,
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
          "Runs the expiry sweep by hand. Normally this is driven by the scheduled POST /api/cron/sweep-expiries; this exists so staff can clear a stuck slot without waiting for the next run. It also fails sync runs whose process stopped sending a heartbeat, so a provider left holding the in-flight lock does not read as syncing; a scheduled sync no longer waits for this, because opening a run reaps a stale lock itself. Idempotent — running it twice changes nothing the second time.",
        tags: ["Admin"],
        successDescription: "What the sweep changed.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(sweepResultSchema)
      .handler(({ context }) => sweepExpiries(context.db, context.provider)),
    sendPaymentReminders: adminProcedure
      .route({
        method: "POST",
        path: "/admin/maintenance/sendPaymentReminders",
        operationId: "sendPaymentReminders",
        summary: "Remind customers of a balance falling due",
        description:
          "Mails every confirmed booking whose balance installment falls due within the next ten days. Normally driven by the scheduled POST /api/cron/payment-reminders; this exists so staff can send the batch after a mailer outage without waiting a day. Each installment is claimed before it is mailed, so running this twice sends nothing the second time.",
        tags: ["Admin"],
        successDescription: "How many reminders went out.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(reminderResultSchema)
      .handler(({ context }) => sendBalanceReminders(context.db)),
    drainOutbox: adminProcedure
      .route({
        method: "POST",
        path: "/admin/maintenance/drainOutbox",
        operationId: "drainOutbox",
        summary: "Send the mail checkout queued but never delivered",
        description:
          "Works through the outbox by hand: the set-password invitations and booking confirmations that guest checkout writes down instead of sending, so the customer is not kept waiting on Resend. Checkout drains this in-process the moment it has answered and POST /api/cron/drain-outbox retries what it missed, so a healthy system leaves nothing here; this exists to push the backlog out after a mailer outage rather than waiting on the backoff. Each message is claimed before it is sent, so running this twice sends nothing the second time.",
        tags: ["Admin"],
        successDescription: "What the drain sent, is retrying, and gave up on.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(outboxDrainResultSchema)
      .handler(({ context }) => drainOutbox(context.db)),
  },
  lead: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/lead/list",
        operationId: "listLeads",
        summary: "List pre-booking enquiries",
        description:
          "Returns enquiries from Request Quote, Contact a charter expert, and Get Consultation, newest first, filterable by kind and status. Reply to one with admin.lead.answer. Distinct from admin.enquiry.list, which is questions about existing bookings.",
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
    answer: adminProcedure
      .route({
        method: "POST",
        path: "/admin/lead/answer",
        operationId: "answerLead",
        summary: "Reply to a pre-booking enquiry",
        description:
          "Records the reply and emails it to the enquirer with their message quoted back and a link to the yacht they asked about. Closes the enquiry unless `close` is false, which leaves it at contacted for a follow-up. Writes an audit log entry. A failed send does not lose the recorded answer.",
        tags: ["Admin"],
        successDescription: "The answered enquiry.",
        spec: withJsonBodyExample({
          id: "lead_example",
          answer:
            "That week is still open at the price shown. Shall I hold it for you until Friday?",
        }),
      })
      .input(leadAnswerInputSchema)
      .output(leadSchema)
      .handler(({ context, input }) => answerLead(context.db, context.session.user.id, input)),
  },
  enquiry: {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/enquiry/list",
        operationId: "listBookingEnquiries",
        summary: "List questions asked about bookings",
        description:
          "Questions customers asked from the checkout's Ask a question step or from /support, newest first, filterable by status and searchable by customer email or booking reference. Each row carries the booking it is about. Distinct from admin.lead.list, which is the pre-booking funnel.",
        tags: ["Admin"],
        successDescription: "A page of booking enquiries.",
        spec: withJsonBodyExample({ status: "open", page: 1, pageSize: 20 }),
      })
      .input(enquiryListInputSchema)
      .output(enquiryListSchema)
      .handler(({ context, input }) => listEnquiries(context.db, input)),
    answer: adminProcedure
      .route({
        method: "POST",
        path: "/admin/enquiry/answer",
        operationId: "answerBookingEnquiry",
        summary: "Reply to a booking question",
        description:
          "Records the reply and emails it to the customer with their question quoted back and a link to the booking. Closes the enquiry unless `close` is false, which leaves it open for a follow-up. Writes an audit log entry. A failed send does not lose the recorded answer.",
        tags: ["Admin"],
        successDescription: "The answered enquiry.",
        spec: withJsonBodyExample({
          id: "enq_example",
          answer: "Yes — please bring the skipper's licence and one ID per guest.",
        }),
      })
      .input(enquiryAnswerInputSchema)
      .output(enquiryRowSchema)
      .handler(({ context, input }) => answerEnquiry(context.db, context.session.user.id, input)),
    setStatus: adminProcedure
      .route({
        method: "POST",
        path: "/admin/enquiry/setStatus",
        operationId: "setBookingEnquiryStatus",
        summary: "Reopen or close a booking question",
        description:
          "Moves an enquiry without replying — closing one handled by phone, or reopening one that was closed too early. Writes an audit log entry.",
        tags: ["Admin"],
        successDescription: "The enquiry with its new status.",
        spec: withJsonBodyExample({ id: "enq_example", status: "closed" }),
      })
      .input(enquirySetStatusInputSchema)
      .output(enquiryRowSchema)
      .handler(({ context, input }) =>
        setEnquiryStatus(context.db, context.session.user.id, input),
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
