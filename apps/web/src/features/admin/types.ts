import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/* Admin console view-types, inferred from the oRPC contract. */
type AdminClient = AppRouterClient["admin"];

export type DuplicateQueue = Awaited<ReturnType<AdminClient["match"]["queue"]>>;
export type DuplicateCandidate = DuplicateQueue["items"][number];
export type DuplicateDecision = DuplicateCandidate["decision"];
export type DuplicateQueueSummary = DuplicateQueue["summary"];
export type DuplicateConfidenceBand = DuplicateQueueSummary["confidenceBands"][number]["band"];
/** The band filter, plus the "any band" the queue opens on. */
export type DuplicateConfidenceFilter = DuplicateConfidenceBand | "all";
/** Whatever the matcher recorded on the candidate, as the contract hands it over. */
export type DuplicateSignals = NonNullable<DuplicateCandidate["signals"]>;
export type DuplicateSide = DuplicateCandidate["sideA"];
export type DuplicateSideListing = NonNullable<DuplicateSide["listing"]>;

export type DuplicatePhoto = DuplicateSideListing["photos"][number];

/** The on-demand second read: the long tail of specs behind a pair, per side. */
export type DuplicateDetail = Awaited<ReturnType<AdminClient["match"]["detail"]>>;
export type DuplicateDetailSide = DuplicateDetail["sideA"];
export type DuplicateDetailListing = NonNullable<DuplicateDetailSide["listing"]>;

export type EnquiryList = Awaited<ReturnType<AdminClient["enquiry"]["list"]>>;
export type EnquiryRow = EnquiryList["items"][number];
export type EnquiryStatus = EnquiryRow["status"];

export type LeadList = Awaited<ReturnType<AdminClient["lead"]["list"]>>;
export type LeadRow = LeadList["items"][number];
export type LeadStatus = LeadRow["status"];
export type LeadKind = LeadRow["kind"];

export type InvoiceList = Awaited<ReturnType<AdminClient["invoice"]["list"]>>;
export type InvoiceRow = InvoiceList["items"][number];
export type InvoiceStatus = InvoiceRow["status"];

export type BookingAdminDetail = Awaited<ReturnType<AdminClient["booking"]["get"]>>;
export type BookingAdminPayment = BookingAdminDetail["payments"][number];
export type BookingAdminList = Awaited<ReturnType<AdminClient["booking"]["list"]>>;
export type BookingAdminRow = BookingAdminList["items"][number];
export type BookingStatus = BookingAdminRow["status"];
/** What admin.booking.refund reports back — some of it needs a human, so it is shown. */
export type RefundResult = Awaited<ReturnType<AdminClient["booking"]["refund"]>>;

export type ListingAdminList = Awaited<ReturnType<AdminClient["listing"]["list"]>>;
export type ListingAdminRow = ListingAdminList["items"][number];
export type ListingStatus = ListingAdminRow["status"];
/**
 * The statuses a person can move a listing to, taken from the procedure that moves it.
 *
 * Narrower than `ListingStatus`, which also carries `merged`: that one is written by a
 * duplicate merge to say the listing's offers now live elsewhere, and it is displayable
 * but never choosable.
 */
export type MovableStatus = Parameters<AdminClient["listing"]["setStatus"]>[0]["status"];

export type SyncRunList = Awaited<ReturnType<AdminClient["provider"]["syncRuns"]>>;
export type SyncRunRow = SyncRunList["items"][number];
export type SyncRunKind = SyncRunRow["kind"];
export type SyncRunState = SyncRunRow["status"];
export type SyncRunStatus = Awaited<ReturnType<AdminClient["provider"]["syncStatus"]>>;

/** The connector keys the provider procedures accept, as the contract spells them. */
export type ProviderKey = SyncRunStatus["provider"];

/* Audit log view-types, inferred from the oRPC contract. */
export type AuditList = Awaited<ReturnType<AdminClient["audit"]["list"]>>;
export type AuditRow = AuditList["items"][number];
export type AuditAction = AuditRow["action"];

const PROVIDER_KEYS: readonly ProviderKey[] = ["mock", "booking_manager", "nausys"];

/**
 * `SyncRunRow.provider` is the stored provider code, deliberately a plain string so a run
 * belonging to a connector this build does not ship still lists. `syncStatus` only takes the
 * three it knows, so a row has to be narrowed before its errors can be fetched.
 */
export function toProviderKey(code: string): ProviderKey | undefined {
  return PROVIDER_KEYS.find((key) => key === code);
}

/* Suggested-route authoring, inferred from the oRPC contract. */
export type RouteList = Awaited<ReturnType<AdminClient["route"]["list"]>>;
export type RouteRow = RouteList["items"][number];
export type RouteKind = RouteRow["kind"];
export type RouteStopRow = RouteRow["stops"][number];

export type GeographyOptions = Awaited<ReturnType<AdminClient["geography"]["options"]>>;
export type GeographyCountry = GeographyOptions["countries"][number];
export type GeographyRegion = GeographyOptions["regions"][number];
export type GeographyBase = GeographyOptions["bases"][number];

/** The five itinerary shapes the library is written against, in the order the picker lists them. */
export const ROUTE_KINDS: readonly RouteKind[] = [
  "seven_days",
  "fourteen_days",
  "family",
  "first_time_sailors",
  "active_sailing",
];

/* FAQ authoring, inferred from the oRPC contract. */
export type FaqList = Awaited<ReturnType<AdminClient["faq"]["list"]>>;
/** One question with every translation of it — the unit the whole screen deals in. */
export type FaqGroupRow = FaqList["items"][number];
export type FaqTranslation = FaqGroupRow["translations"][number];
export type FaqLocale = FaqTranslation["locale"];
export type FaqCategory = NonNullable<FaqGroupRow["category"]>;
export type FaqScope = "site" | "listing";
export type FaqGap = NonNullable<Parameters<AdminClient["faq"]["list"]>[0]>["gap"];
/** What the mutations report about dropping the public page's cached copy. */
export type FaqCacheResult = Awaited<ReturnType<AdminClient["faq"]["update"]>>["cache"];

/** The site's locales, in the order the editor's panes and the table's chips read them. */
export const FAQ_LOCALES: readonly FaqLocale[] = ["en", "de", "es", "uk"];

/** `faq_category` in its declaration order, which is the order the public page renders. */
export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  "booking",
  "payment",
  "prices",
  "licences",
  "travel",
  "cancellation",
];

/**
 * How one locale of one question stands.
 *
 * Three states, not two: the public read matches locale exactly and drops a blank answer, so a
 * translation that exists but answers nothing is as invisible as one that was never written —
 * and it is the one an editor cannot see without being told.
 */
export type FaqTranslationState = "answered" | "unanswered" | "missing";

export function faqTranslationState(group: FaqGroupRow, locale: FaqLocale): FaqTranslationState {
  if (group.missingLocales.includes(locale)) return "missing";
  return group.unansweredLocales.includes(locale) ? "unanswered" : "answered";
}

/** Nothing answered in any language: the entry is on the list and on nobody's page. */
export function faqIsUnpublished(group: FaqGroupRow): boolean {
  return group.translations.every((entry) => entry.answer === null);
}
