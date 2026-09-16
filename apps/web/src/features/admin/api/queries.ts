import { orpc } from "@/utils/orpc";

import type {
  AuditAction,
  FaqCategory,
  FaqGap,
  FaqLocale,
  FaqScope,
  PopularFacetKind,
  PopularFacetSurface,
  RouteKind,
  BookingStatus,
  CommissionStatus,
  DuplicateConfidenceFilter,
  DuplicateDecision,
  EnquiryStatus,
  InvoiceStatus,
  LeadKind,
  LeadStatus,
  ListingStatus,
  ProviderKey,
  SyncRunKind,
  SyncRunState,
  UserAccountStatus,
  UserAdminSort,
  UserRole,
} from "../types";

/*
 * Isomorphic query option factories — used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const AUDIT_PAGE_SIZE = 20;
export const DUPLICATES_PAGE_SIZE = 20;
export const INBOX_PAGE_SIZE = 20;
export const SYNC_RUNS_PAGE_SIZE = 20;
export const PAYMENTS_PAGE_SIZE = 20;
export const LISTINGS_PAGE_SIZE = 20;
export const BOOKINGS_PAGE_SIZE = 20;
export const USERS_PAGE_SIZE = 20;
export const ROUTES_PAGE_SIZE = 20;
export const FAQ_PAGE_SIZE = 20;
export const COMMISSIONS_PAGE_SIZE = 20;

/** The bookings whose money is owed back — the refund tab's entire filter. */
export const REFUND_QUEUE_STATUSES: readonly BookingStatus[] = ["REFUND_PENDING"];

/*
 * The band the queue opens on. Pairs scored 90% and up are the ones a reviewer can settle at a
 * glance, and they are a third of the proposals, so starting there is the difference between a
 * queue that gets worked and one that gets scrolled. Read by the screen's initial state as well
 * as the fallback below, so the server prefetch and the first client render share a cache key.
 */
export const DUPLICATES_DEFAULT_CONFIDENCE: DuplicateConfidenceFilter = "high";

/* Every filter stays explicit so each combination keeps its own cache key, and so the
   server prefetch and the client's first render agree on it down to the last field. */
export const duplicateQueueQueryOptions = (input: {
  decision: DuplicateDecision;
  confidence?: DuplicateConfidenceFilter;
  matchedOn?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.match.queue.queryOptions({
    input: {
      decision: input.decision,
      confidence: input.confidence ?? DUPLICATES_DEFAULT_CONFIDENCE,
      matchedOn: input.matchedOn,
      page: input.page,
      pageSize: input.pageSize ?? DUPLICATES_PAGE_SIZE,
    },
    staleTime: 30_000,
  });

/*
 * The pair's photos and full specs, fetched only once a reviewer opens one — 20 pairs'
 * worth of galleries is not something the queue should pay for. Cached longer than the
 * queue because a synced listing's specs do not move while the tab is open.
 */
export const duplicateDetailQueryOptions = (candidateId: string) =>
  orpc.admin.match.detail.queryOptions({ input: { candidateId }, staleTime: 300_000 });

/*
 * Precision per rule and band. Cached longer than the queue because it only moves as pairs are
 * reviewed, and it still refreshes on a verdict: the mutations invalidate the whole
 * `admin.match` segment, which is right here — a decision is exactly what changes these rates.
 */
export const duplicateMetricsQueryOptions = () =>
  orpc.admin.match.metrics.queryOptions({ input: {}, staleTime: 300_000 });

/*
 * The staff inbox reads two unrelated queues side by side: questions about existing bookings
 * (booking_enquiry) and pre-booking enquiries (lead). Both are worked through by hand, so both
 * go stale as soon as a colleague touches one — hence the short staleTime.
 */
export const enquiryListQueryOptions = (input: {
  status?: EnquiryStatus;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.enquiry.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? INBOX_PAGE_SIZE },
    staleTime: 15_000,
  });

export const leadListQueryOptions = (input: {
  status?: LeadStatus;
  kind?: LeadKind;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.lead.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? INBOX_PAGE_SIZE },
    staleTime: 15_000,
  });

/*
 * The two staff payment queues. Both are worked by hand and both move a booking when they are,
 * so a colleague acting on one makes the other's snapshot wrong — hence the short staleTime that
 * the inbox queues use for the same reason.
 */
export const invoiceListQueryOptions = (input: {
  status?: InvoiceStatus;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.invoice.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? PAYMENTS_PAGE_SIZE },
    staleTime: 15_000,
  });

export const bookingQueueQueryOptions = (input: {
  status?: readonly BookingStatus[];
  query?: string;
  /** Bring back the bookings someone marked as not real business; off unless asked for. */
  includeExcluded?: boolean;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.booking.list.queryOptions({
    input: {
      ...input,
      status: input.status ? [...input.status] : undefined,
      includeExcluded: input.includeExcluded ?? false,
      pageSize: input.pageSize ?? PAYMENTS_PAGE_SIZE,
    },
    staleTime: 15_000,
  });

export const userListQueryOptions = (input: {
  query?: string;
  role?: UserRole;
  status?: UserAccountStatus;
  hasBookings?: boolean;
  sort?: UserAdminSort;
  page: number;
}) =>
  orpc.admin.user.list.queryOptions({
    input: { ...input, sort: input.sort ?? "newest", pageSize: USERS_PAGE_SIZE },
    staleTime: 15_000,
  });

/**
 * One booking for staff. Longer staleTime than the queues: a detail screen is opened to read,
 * and the actions on it invalidate the whole booking segment anyway.
 */
export const bookingDetailQueryOptions = (input: { id: string }) =>
  orpc.admin.booking.get.queryOptions({ input, staleTime: 30_000 });

/*
 * The admin audit trail. Every staff mutation writes one row and nothing edits them, so a page
 * only goes stale when a colleague acts — short staleTime, same as the queues.
 */
export const auditListQueryOptions = (input: {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.audit.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? AUDIT_PAGE_SIZE },
    staleTime: 15_000,
  });

/*
 * The catalogue as staff see it, drafts included. Short staleTime for the same reason the
 * queues have one: this is a review screen two people work at once, and a row a colleague
 * has just published must not stay listed as a draft here.
 */
export const listingAdminListQueryOptions = (input: {
  provider?: ProviderKey;
  operatorId?: string;
  status?: ListingStatus;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.listing.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? LISTINGS_PAGE_SIZE },
    staleTime: 15_000,
  });

/*
 * What the active connector can actually do. Fixed for the life of a deployment — it is
 * compiled into the adapter, not stored — so this is read once and kept.
 */
export const providerCapabilitiesQueryOptions = () =>
  orpc.admin.provider.capabilities.queryOptions({ staleTime: Number.POSITIVE_INFINITY });

/*
 * How each vendor has been answering, over a window the reader picks. Cached for a minute: it
 * is an aggregate over every quote of the last month, and one more attempt cannot move it.
 */
export const providerReliabilityQueryOptions = (windowDays: number) =>
  orpc.admin.provider.reliability.queryOptions({ input: { windowDays }, staleTime: 60_000 });

/*
 * The commission rates staff have entered. Short staleTime for the reason the other staff
 * queues have one: two people can be editing the same agreements, and a rate a colleague has
 * just switched off must not stay listed as active here.
 */
export const commissionListQueryOptions = (input: {
  provider?: ProviderKey;
  status?: CommissionStatus;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.commission.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? COMMISSIONS_PAGE_SIZE },
    staleTime: 15_000,
  });

/* The rate form's operator picker. Operators are written by the catalogue sync and effectively
   fixed between runs, so a search result keeps for a minute. */
export const commissionOperatorOptionsQueryOptions = (query: string) =>
  orpc.admin.commission.operatorOptions.queryOptions({
    input: { query: query || undefined },
    staleTime: 60_000,
  });

export const syncRunsQueryOptions = (input: {
  provider?: ProviderKey;
  kind?: SyncRunKind;
  status?: SyncRunState;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.provider.syncRuns.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? SYNC_RUNS_PAGE_SIZE },
    /* A run that is still running changes under us, so this list goes stale fast. */
    staleTime: 10_000,
  });

/**
 * One run's errors, behind the expandable row. `provider` is required because the
 * procedure otherwise answers for whichever connector PROVIDER_MODE names, which is
 * not necessarily the one that owns this run.
 */
export const syncRunStatusQueryOptions = (input: { syncRunId: string; provider: ProviderKey }) =>
  orpc.admin.provider.syncStatus.queryOptions({ input, staleTime: 10_000 });

/*
 * The hand-authored route library. Nothing syncs into it and nothing else writes it, so it goes
 * stale only when a colleague authors one — the same reason the review queues carry a short
 * staleTime rather than none.
 */
/*
 * The home page's own list, which is a different question from the library: `admin.route.list`
 * pages through everything staff ever wrote, this is the handful the site shows and the order it
 * shows them in. Read on its own so the picker and the selection cannot disagree about the order.
 */
export const featuredRoutesQueryOptions = () =>
  orpc.admin.route.listFeatured.queryOptions({ input: {}, staleTime: 15_000 });

export const routeListQueryOptions = (input: {
  query?: string;
  kind?: RouteKind;
  countryId?: string;
  active?: boolean;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.route.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? ROUTES_PAGE_SIZE },
    staleTime: 15_000,
  });

/**
 * Countries, regions and bases for the target picker.
 *
 * Geography is written by the catalogue sync and read here; it changes when a provider ships a
 * new marina, which is not within one authoring session. Kept for the life of the tab.
 */
export const geographyOptionsQueryOptions = (input: { countryId?: string; query?: string } = {}) =>
  orpc.admin.geography.options.queryOptions({
    input: { ...input, limit: 200 },
    staleTime: 5 * 60_000,
  });

/*
 * The FAQ, one row per question rather than one per locale.
 *
 * Hand-written and hand-translated, so it moves only when a colleague edits it — the same short
 * staleTime the review queues carry, for the same reason. `locale` is part of the key because it
 * changes what the answer says, not only what is shown: it is the language the gap counts and
 * the search are asked about.
 */
export const faqListQueryOptions = (input: {
  scope: FaqScope;
  listingId?: string;
  category?: FaqCategory;
  locale?: FaqLocale;
  query?: string;
  gap?: FaqGap;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.faq.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? FAQ_PAGE_SIZE },
    staleTime: 15_000,
  });

/**
 * The curated order for one facet kind and surface.
 *
 * Both keys are part of the query key because both change the answer rather than only its
 * presentation: `kind` picks which vocabulary is listed, `surface` which of the two ranks is
 * read. The same short staleTime as the FAQ, and for the same reason -- this moves only when a
 * colleague edits it.
 */
export const popularFacetsQueryOptions = (input: {
  kind: PopularFacetKind;
  surface: PopularFacetSurface;
  locale?: string;
}) => orpc.admin.popularFacets.list.queryOptions({ input, staleTime: 15_000 });

/**
 * The marketplace-wide settings. One row for the whole site, so no filters and no page: the
 * key is the procedure's own.
 */
export const marketplaceSettingsQueryOptions = () => orpc.admin.settings.get.queryOptions({});

/** How the home page's popular-yachts slider is composed. One row, like the settings. */
export const popularYachtsConfigQueryOptions = () => orpc.admin.popularYachts.get.queryOptions({});

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const duplicateKey = () => orpc.admin.match.key();
export const confirmDuplicateMutationOptions = () => orpc.admin.match.confirm.mutationOptions();
export const rejectDuplicateMutationOptions = () => orpc.admin.match.reject.mutationOptions();
export const reopenDuplicateMutationOptions = () => orpc.admin.match.reopen.mutationOptions();
export const deferDuplicateMutationOptions = () => orpc.admin.match.defer.mutationOptions();
export const splitListingOfferMutationOptions = () => orpc.admin.match.split.mutationOptions();

export const enquiryKey = () => orpc.admin.enquiry.key();
export const answerEnquiryMutationOptions = () => orpc.admin.enquiry.answer.mutationOptions();
export const setEnquiryStatusMutationOptions = () => orpc.admin.enquiry.setStatus.mutationOptions();

export const leadKey = () => orpc.admin.lead.key();
export const answerLeadMutationOptions = () => orpc.admin.lead.answer.mutationOptions();
export const setLeadStatusMutationOptions = () => orpc.admin.lead.setStatus.mutationOptions();

export const invoiceKey = () => orpc.admin.invoice.key();
export const settleInvoiceMutationOptions = () => orpc.admin.invoice.settle.mutationOptions();
export const cancelInvoiceMutationOptions = () => orpc.admin.invoice.cancel.mutationOptions();

export const adminBookingKey = () => orpc.admin.booking.key();
export const setBookingExcludedMutationOptions = () =>
  orpc.admin.booking.setExcluded.mutationOptions();
export const refundBookingMutationOptions = () => orpc.admin.booking.refund.mutationOptions();
export const cancelAdminBookingMutationOptions = () => orpc.admin.booking.cancel.mutationOptions();

export const listingKey = () => orpc.admin.listing.key();
export const listingFieldSourcesQueryOptions = (listingId: string) =>
  orpc.admin.listing.fieldSources.queryOptions({ input: { listingId } });
export const setListingStatusMutationOptions = () => orpc.admin.listing.setStatus.mutationOptions();
export const publishDraftsMutationOptions = () =>
  orpc.admin.listing.publishDrafts.mutationOptions();
export const setListingFieldSourceMutationOptions = () =>
  orpc.admin.listing.setFieldSource.mutationOptions();

export const commissionKey = () => orpc.admin.commission.key();
export const createCommissionMutationOptions = () => orpc.admin.commission.create.mutationOptions();
export const updateCommissionMutationOptions = () => orpc.admin.commission.update.mutationOptions();
export const setCommissionActiveMutationOptions = () =>
  orpc.admin.commission.setActive.mutationOptions();

export const syncRunsKey = () => orpc.admin.provider.syncRuns.key();
export const startSyncMutationOptions = (kind: "catalogue" | "availability") => {
  const procedure =
    kind === "catalogue" ? orpc.admin.provider.syncCatalogue : orpc.admin.provider.syncAvailability;
  return procedure.mutationOptions();
};

export const unreleasedOptionsKey = () => orpc.admin.maintenance.unreleasedOptions.key();
export const unreleasedOptionsQueryOptions = () =>
  orpc.admin.maintenance.unreleasedOptions.queryOptions({ input: {} });
export const sweepExpiriesMutationOptions = () =>
  orpc.admin.maintenance.sweepExpiries.mutationOptions();
export const sendPaymentRemindersMutationOptions = () =>
  orpc.admin.maintenance.sendPaymentReminders.mutationOptions();
export const retryReleaseMutationOptions = () =>
  orpc.admin.maintenance.retryRelease.mutationOptions();

export const routeKey = () => orpc.admin.route.key();
export const reorderFeaturedRoutesMutationOptions = () =>
  orpc.admin.route.reorderFeatured.mutationOptions();
export const createRouteMutationOptions = () => orpc.admin.route.create.mutationOptions();
export const updateRouteMutationOptions = () => orpc.admin.route.update.mutationOptions();
export const setRouteActiveMutationOptions = () => orpc.admin.route.setActive.mutationOptions();
export const deleteRouteMutationOptions = () => orpc.admin.route.delete.mutationOptions();
export const createRouteStopMutationOptions = () => orpc.admin.route.stop.create.mutationOptions();
export const updateRouteStopMutationOptions = () => orpc.admin.route.stop.update.mutationOptions();
export const deleteRouteStopMutationOptions = () => orpc.admin.route.stop.delete.mutationOptions();
export const reorderRouteStopsMutationOptions = () =>
  orpc.admin.route.stop.reorder.mutationOptions();

export const faqKey = () => orpc.admin.faq.key();
export const faqListingOptionsQueryOptions = (query: string) =>
  orpc.admin.discount.yachtOptions.queryOptions({
    input: { query: query.trim() || undefined, limit: 20 },
    staleTime: 60_000,
  });
export const createFaqEntryMutationOptions = () => orpc.admin.faq.create.mutationOptions();
export const updateFaqEntryMutationOptions = () => orpc.admin.faq.update.mutationOptions();
export const deleteFaqEntryMutationOptions = () => orpc.admin.faq.delete.mutationOptions();
export const reorderFaqMutationOptions = () => orpc.admin.faq.reorder.mutationOptions();

export const popularFacetsKey = () => orpc.admin.popularFacets.key();
export const facetMediaQueryOptions = (input: { kind: PopularFacetKind; value: string }) =>
  orpc.admin.popularFacets.media.queryOptions({ input });
export const setPopularFacetsMutationOptions = () => orpc.admin.popularFacets.set.mutationOptions();
export const updateFacetMediaMutationOptions = () =>
  orpc.admin.popularFacets.updateMedia.mutationOptions();
export const uploadFacetImageMutationOptions = () =>
  orpc.admin.popularFacets.uploadImage.mutationOptions();

export const marketplaceSettingsKey = () => orpc.admin.settings.key();
export const updateMarketplaceSettingsMutationOptions = () =>
  orpc.admin.settings.update.mutationOptions();

export const popularYachtsConfigKey = () => orpc.admin.popularYachts.key();
export const updatePopularYachtsConfigMutationOptions = () =>
  orpc.admin.popularYachts.update.mutationOptions();
