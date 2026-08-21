import { z } from "zod";

import {
  currencySchema,
  dateRangeRefinement,
  idSchema,
  isoDateSchema,
  moneySchema,
  paginatedSchema,
  paginationInputDefault,
  paginationInputSchema,
} from "./primitives";

/* ------------------------------------------------------------ provider sync */

export const providerKeyOutputSchema = z.enum(["mock", "booking_manager", "nausys"]);

/** Returned the moment the run row exists; the work itself outlives the request. */
export const syncRunStartedSchema = z.object({
  syncRunId: z.string(),
  provider: providerKeyOutputSchema,
  status: z.literal("pending"),
});

/** Omit `provider` to start every enabled connector; name one to start just it. */
export const syncStartInputSchema = z
  .object({
    provider: providerKeyOutputSchema.optional(),
  })
  .default({});

/** One provider's outcome in a fan-out. A run already in flight is not an error. */
export const syncRunOutcomeSchema = z.discriminatedUnion("started", [
  syncRunStartedSchema.extend({ started: z.literal(true) }),
  z.object({
    started: z.literal(false),
    provider: z.string(),
    reason: z.enum(["already_running", "failed"]),
    message: z.string(),
  }),
]);

export const syncRunsStartedSchema = z.object({ runs: z.array(syncRunOutcomeSchema) });

export const syncRunStatusInputSchema = z
  .object({
    /** Defaults to the provider's most recent run. */
    syncRunId: z.string().min(1).optional(),
    errorLimit: z.number().int().min(1).max(200).optional(),
    /** Without it, "latest" spans kinds and an availability run answers for the catalogue. */
    kind: z.enum(["catalogue", "availability", "pricing"]).optional(),
    /** Defaults to the transacting provider, which is the one PROVIDER_MODE names. */
    provider: providerKeyOutputSchema.optional(),
  })
  .default({});

export const syncRunStatusSchema = z.object({
  syncRunId: z.string(),
  provider: providerKeyOutputSchema,
  kind: z.enum(["catalogue", "availability", "pricing"]),
  status: z.enum(["pending", "running", "success", "failed", "partial"]),
  createdCount: z.number().int(),
  updatedCount: z.number().int(),
  skippedCount: z.number().int(),
  failedCount: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errors: z.array(
    z.object({
      id: z.string(),
      errorType: z.enum(["rate_limited", "transient", "auth", "not_found", "contract"]),
      message: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const syncRunKindSchema = z.enum(["catalogue", "availability", "pricing"]);

export const syncRunStateSchema = z.enum(["pending", "running", "success", "failed", "partial"]);

const SYNC_RUN_PAGE_SIZE = 20;

export const syncRunListInputSchema = z
  .object({
    provider: providerKeyOutputSchema.optional(),
    kind: syncRunKindSchema.optional(),
    status: syncRunStateSchema.optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: SYNC_RUN_PAGE_SIZE }),
  })
  .default(paginationInputDefault(SYNC_RUN_PAGE_SIZE));

export const syncRunRowSchema = z.object({
  syncRunId: z.string(),
  /**
   * The `provider.code` as stored, not the connector enum: the table can hold a
   * code for a connector this build does not ship, and history must still list.
   */
  provider: z.string(),
  providerName: z.string(),
  kind: syncRunKindSchema,
  status: syncRunStateSchema,
  createdCount: z.number().int(),
  updatedCount: z.number().int(),
  skippedCount: z.number().int(),
  failedCount: z.number().int(),
  errorCount: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const syncRunListSchema = paginatedSchema(syncRunRowSchema);

/* ------------------------------------------------------ duplicate review */

export const matchStatusSchema = z.enum(["unmatched", "auto", "confirmed", "rejected"]);

export const duplicateDecisionSchema = z.enum(["pending", "confirmed", "rejected"]);

export const listingStatusSchema = z.enum(["draft", "published", "hidden"]);

/** Null throughout when the side's listing was deleted out from under the pair. */
export const duplicateSideListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: listingStatusSchema,
  operatorName: z.string().nullable(),
  modelName: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  lengthM: z.number().nullable(),
  cabins: z.number().int().nullable(),
  berths: z.number().int().nullable(),
  baseName: z.string().nullable(),
  locationName: z.string().nullable(),
  // Verbatim vendor URL rather than z.url(): these are stored exactly as the
  // provider shipped them, and one malformed row must not fail the whole page.
  primaryImageUrl: z.string().nullable(),
});

export const duplicateSideSchema = z.object({
  sourceId: z.string(),
  provider: z.string(),
  externalYachtId: z.string(),
  matchStatus: matchStatusSchema,
  listing: duplicateSideListingSchema.nullable(),
});

/** Whatever the matcher recorded, e.g. `{ matchedOn: "model+yearBuilt" }`. */
export const duplicateSignalsSchema = z.record(z.string(), z.unknown()).nullable();

export const duplicateCandidateSchema = z.object({
  id: z.string(),
  decision: duplicateDecisionSchema,
  confidence: z.number().nullable(),
  signals: duplicateSignalsSchema,
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  sideA: duplicateSideSchema,
  sideB: duplicateSideSchema,
});

const DUPLICATE_PAGE_SIZE = 20;

export const duplicateQueueInputSchema = z
  .object({
    decision: duplicateDecisionSchema.default("pending"),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DUPLICATE_PAGE_SIZE }),
  })
  .default({ ...paginationInputDefault(DUPLICATE_PAGE_SIZE), decision: "pending" });

export const duplicateQueueSchema = paginatedSchema(duplicateCandidateSchema);

/** The reviewer picks the survivor; the pair's other listing is the one hidden. */
export const duplicateConfirmInputSchema = z.object({
  candidateId: idSchema,
  keepListingId: idSchema,
});

export const duplicateRejectInputSchema = z.object({ candidateId: idSchema });

export const duplicateResolutionSchema = z.object({
  candidateId: z.string(),
  decision: duplicateDecisionSchema,
  keptListingId: z.string().nullable(),
  hiddenListingId: z.string().nullable(),
  /** How many `listing_source` rows were repointed at the survivor. */
  movedSourceCount: z.number().int(),
});

/* ---------------------------------------------------------------- audit log */

export const auditActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "sync",
  "merge",
  "price_adjustment",
]);

const AUDIT_PAGE_SIZE = 20;

export const auditListInputSchema = z
  .object({
    entityType: z.string().trim().max(100).optional(),
    entityId: z.string().trim().max(200).optional(),
    action: auditActionSchema.optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: AUDIT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(AUDIT_PAGE_SIZE));

export const auditRowSchema = z.object({
  id: z.string(),
  action: auditActionSchema,
  entityType: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  metadata: z.unknown(),
  createdAt: z.string(),
  /** Null once the actor's account is gone: audit_log.actor_user_id is set null. */
  actor: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable(),
});

export const auditListSchema = paginatedSchema(auditRowSchema);

/* ---------------------------------------------------------------- discounts */

export const discountTypeSchema = z.enum(["percentage", "fixed_amount"]);

/** Derived from `active` plus the date window — never stored. */
export const discountStatusSchema = z.enum(["active", "scheduled", "expired", "inactive"]);

export const discountTargetTypeSchema = z.enum([
  "all",
  "category",
  "listing",
  "operator",
  "region",
]);

export const discountTargetSchema = z.object({
  targetType: discountTargetTypeSchema,
  targetId: z.string().nullable(),
  /** Resolved display name ("Catamaran", "Bora Breeze"); null for `all`. */
  targetLabel: z.string().nullable(),
});

export const discountSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  type: discountTypeSchema,
  valuePct: z.number().nullable(),
  value: moneySchema.nullable(),
  targets: z.array(discountTargetSchema),
  /** Server-rendered "Applies to" cell, so the table does not reassemble targets. */
  appliesToLabel: z.string(),
  status: discountStatusSchema,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  usageLimit: z.number().int().nullable(),
  usageCount: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
});

const DEFAULT_PAGE_SIZE = 10;

export const discountListInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    status: discountStatusSchema.optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

export const discountListSchema = paginatedSchema(discountSchema);

export const discountIdInputSchema = z.object({ id: idSchema });

const targetInputSchema = z.object({
  targetType: discountTargetTypeSchema,
  targetId: z.string().min(1).nullable().optional(),
});

const isoDate = isoDateSchema;

const endsAtNotBeforeStartsAt = dateRangeRefinement(
  "startsAt",
  "endsAt",
  "endsAt must be on or after startsAt",
);

const discountFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Codes are typed by customers, so they are matched case-insensitively by being
  // stored and compared upper-cased. Spaces would make a share link ambiguous.
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, hyphen or underscore")
    .toUpperCase(),
  type: discountTypeSchema,
  valuePct: z.number().min(0).max(100).nullable().optional(),
  valueMinor: z.number().int().min(0).nullable().optional(),
  currency: currencySchema.optional(),
  startsAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  targets: z.array(targetInputSchema).min(1),
});

/**
 * The modal's radio pair means exactly one of the two value fields is meaningful,
 * and `fixed_amount` is unusable without a currency.
 */
const validateDiscountFields = (
  value: {
    type?: "percentage" | "fixed_amount";
    valuePct?: number | null;
    valueMinor?: number | null;
    currency?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    targets?: { targetType: string; targetId?: string | null }[];
  },
  ctx: z.RefinementCtx,
) => {
  if (value.type === "percentage" && (value.valuePct === undefined || value.valuePct === null)) {
    ctx.addIssue({
      code: "custom",
      message: "valuePct is required for a percentage discount",
      path: ["valuePct"],
    });
  }

  if (value.type === "fixed_amount") {
    if (value.valueMinor === undefined || value.valueMinor === null) {
      ctx.addIssue({
        code: "custom",
        message: "valueMinor is required for a fixed discount",
        path: ["valueMinor"],
      });
    }
    if (!value.currency) {
      ctx.addIssue({
        code: "custom",
        message: "currency is required for a fixed discount",
        path: ["currency"],
      });
    }
  }

  endsAtNotBeforeStartsAt(value, ctx);

  for (const [index, target] of (value.targets ?? []).entries()) {
    const needsId = target.targetType !== "all";
    if (needsId && !target.targetId) {
      ctx.addIssue({
        code: "custom",
        message: `targetId is required for a ${target.targetType} target`,
        path: ["targets", index, "targetId"],
      });
    }
  }
};

export const discountCreateInputSchema = discountFieldsSchema.superRefine(validateDiscountFields);

export const discountUpdateInputSchema = discountFieldsSchema
  .partial()
  .extend({ id: z.string().min(1) })
  .superRefine(validateDiscountFields);

export const discountSetActiveInputSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

/** Backs the "Specific Yachts" search box in the create/edit modal. */
export const yachtOptionsInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    categoryCode: z.string().trim().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .default({ limit: 20 });

export const yachtOptionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      categoryName: z.string().nullable(),
      baseName: z.string(),
    }),
  ),
});

/* ----------------------------------------------------------- listing prices */

export const listingPriceListInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    /** Matched against the yacht category name, as stored on the search doc. */
    category: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

export const listingPriceRowSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  baseName: z.string(),
  locationName: z.string(),
  countryName: z.string(),
  /** The recommended price as pulled from the provider. */
  basePrice: moneySchema.nullable(),
  /** basePrice with the active listing-scoped adjustment applied. */
  currentPrice: moneySchema.nullable(),
  activeRuleId: z.string().nullable(),
  activeRuleLabel: z.string().nullable(),
});

export const listingPriceListSchema = paginatedSchema(listingPriceRowSchema);

export const listingPriceFiltersSchema = z.object({
  categories: z.array(z.object({ value: z.string(), label: z.string() })),
  locations: z.array(z.object({ value: z.string(), label: z.string() })),
});

export const listingPriceUpdateInputSchema = z
  .object({
    listingId: z.string().min(1),
    /** The absolute price the listing should show, in minor units. */
    newPriceMinor: z.number().int().min(0),
    currency: currencySchema,
    // The client wants overrides scoped to part of a season. The Figma modal has no
    // date inputs yet, so both are optional and an open-ended override is valid.
    startsAt: isoDate.nullable().optional(),
    endsAt: isoDate.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine(endsAtNotBeforeStartsAt);

export const listingPriceGetInputSchema = z.object({ listingId: idSchema });

export const listingPriceClearInputSchema = z.object({ listingId: idSchema });

/* --------------------------------------------------- listing administration */

const LISTING_ADMIN_PAGE_SIZE = 20;

export const listingAdminListInputSchema = z
  .object({
    /** Narrows the page to listings carrying a `listing_source` from this provider. */
    provider: providerKeyOutputSchema.optional(),
    status: listingStatusSchema.optional(),
    /** Case-insensitive substring of the title or the slug. */
    query: z.string().trim().max(200).optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: LISTING_ADMIN_PAGE_SIZE }),
  })
  .default(paginationInputDefault(LISTING_ADMIN_PAGE_SIZE));

export const listingAdminRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: listingStatusSchema,
  /**
   * The provider `code` behind the listing, null when no `listing_source` points
   * at it. A merged listing carries several; the lowest code wins, so the column
   * is stable between pages rather than picking whichever row the planner read
   * first.
   */
  provider: z.string().nullable(),
  operatorName: z.string().nullable(),
  modelName: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  baseName: z.string().nullable(),
  locationName: z.string().nullable(),
  // Verbatim vendor URL rather than z.url(): stored exactly as the provider
  // shipped it, and one malformed row must not fail the whole page.
  primaryImageUrl: z.string().nullable(),
  /** Cheapest available slot. Null until availability has been synced and priced. */
  priceFromMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  createdAt: z.string(),
});

export const listingAdminListSchema = paginatedSchema(listingAdminRowSchema).extend({
  /**
   * Counts over everything the current filters match, not just this page.
   *
   * `unpricedWithDates` is the one worth watching: a listing with free dates and no
   * published weekly rate is sold as "On request" on the card and shows a calendar
   * that refuses every day, because a rate is what opens a season. Some genuinely are
   * on request - a 40m gulet is priced by conversation. The rest are a price sweep
   * that did not finish, and from outside the two look identical. This is the number
   * that tells them apart: it should be small and stable, and a jump into the
   * thousands means the sweep failed rather than that the fleet went bespoke.
   */
  summary: z.object({
    unpricedWithDates: z.number().int(),
  }),
});

export const listingSetStatusInputSchema = z.object({
  id: idSchema,
  status: listingStatusSchema,
});

export const listingSetStatusSchema = z.object({
  id: z.string(),
  status: listingStatusSchema,
});

/**
 * `provider` is the SCOPE OF THE PUBLISH, not a filter on what comes back.
 *
 * Naming a provider releases only that provider's drafts. Omitting it releases
 * EVERY provider's drafts in the whole database, in one unreviewed batch. A sync
 * imports as `draft` precisely so vendor inventory never reaches customers
 * unseen; an unscoped call is the one way to undo that for the entire catalogue
 * at once, and in production that is thousands of yachts.
 */
export const listingPublishDraftsInputSchema = z
  .object({
    provider: providerKeyOutputSchema
      .optional()
      .describe(
        "Provider code whose drafts are published. OMIT AT YOUR PERIL: with no provider, every provider's unreviewed drafts across the entire catalogue are published at once.",
      ),
  })
  .default({});

export const listingPublishDraftsSchema = z.object({
  publishedCount: z.number().int(),
});
