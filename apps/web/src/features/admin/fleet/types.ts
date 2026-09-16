import type { AdminClient } from "../shared/types";

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

/** How often each matcher rule was right, per band. Nothing acts on it: it is the read
    auto-approval would have to be argued from. */
export type DuplicateMetrics = Awaited<ReturnType<AdminClient["match"]["metrics"]>>;
export type DuplicateMetricRow = DuplicateMetrics["rows"][number];

/** The on-demand second read: the long tail of specs behind a pair, per side. */
export type DuplicateDetail = Awaited<ReturnType<AdminClient["match"]["detail"]>>;
export type DuplicateDetailSide = DuplicateDetail["sideA"];
export type DuplicateDetailListing = NonNullable<DuplicateDetailSide["listing"]>;

/** How each vendor has been answering quote requests. Measured, shown, and acted on by nothing. */
export type ProviderReliability = Awaited<ReturnType<AdminClient["provider"]["reliability"]>>;
export type ProviderReliabilityRow = ProviderReliability["rows"][number];

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

/* Which vendor supplies each part of a merged listing, inferred from the contract. */
export type ListingFieldSources = Awaited<ReturnType<AdminClient["listing"]["fieldSources"]>>;
export type ListingOfferSummary = ListingFieldSources["offers"][number];
export type ListingFieldDecision = ListingFieldSources["decisions"][number];
export type ListingFieldGroup = ListingFieldDecision["field"];

export type SyncRunList = Awaited<ReturnType<AdminClient["provider"]["syncRuns"]>>;
export type SyncRunRow = SyncRunList["items"][number];
export type SyncRunKind = SyncRunRow["kind"];
export type SyncRunState = SyncRunRow["status"];
