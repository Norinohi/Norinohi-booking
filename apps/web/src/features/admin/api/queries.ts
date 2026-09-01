import { orpc } from "@/utils/orpc";

import type {
  AuditAction,
  FaqCategory,
  FaqGap,
  FaqLocale,
  FaqScope,
  RouteKind,
  BookingStatus,
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
export const ROUTES_PAGE_SIZE = 20;
export const FAQ_PAGE_SIZE = 20;

/** The bookings whose money is owed back — the refund tab's entire filter. */
export const REFUND_QUEUE_STATUSES: readonly BookingStatus[] = ["REFUND_PENDING"];

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
      confidence: input.confidence ?? "all",
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
 * The marketplace-wide settings. One row for the whole site, so no filters and no page: the
 * key is the procedure's own.
 */
export const marketplaceSettingsQueryOptions = () => orpc.admin.settings.get.queryOptions({});
