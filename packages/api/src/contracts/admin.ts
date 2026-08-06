import { z } from "zod";

import { moneySchema, paginationSchema } from "./catalog";

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

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

export const discountListInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    status: discountStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
  })
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });

export const discountListSchema = z.object({
  items: z.array(discountSchema),
  pagination: paginationSchema,
});

export const discountIdInputSchema = z.object({ id: z.string().min(1) });

const targetInputSchema = z.object({
  targetType: discountTargetTypeSchema,
  targetId: z.string().min(1).nullable().optional(),
});

const isoDate = z.iso.date();

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
  currency: z.string().trim().length(3).toUpperCase().optional(),
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

  if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) {
    ctx.addIssue({
      code: "custom",
      message: "endsAt must be on or after startsAt",
      path: ["endsAt"],
    });
  }

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
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
  })
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });

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

export const listingPriceListSchema = z.object({
  items: z.array(listingPriceRowSchema),
  pagination: paginationSchema,
});

export const listingPriceFiltersSchema = z.object({
  categories: z.array(z.object({ value: z.string(), label: z.string() })),
  locations: z.array(z.object({ value: z.string(), label: z.string() })),
});

export const listingPriceUpdateInputSchema = z
  .object({
    listingId: z.string().min(1),
    /** The absolute price the listing should show, in minor units. */
    newPriceMinor: z.number().int().min(0),
    currency: z.string().trim().length(3).toUpperCase(),
    // The client wants overrides scoped to part of a season. The Figma modal has no
    // date inputs yet, so both are optional and an open-ended override is valid.
    startsAt: isoDate.nullable().optional(),
    endsAt: isoDate.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) {
      ctx.addIssue({
        code: "custom",
        message: "endsAt must be on or after startsAt",
        path: ["endsAt"],
      });
    }
  });

export const listingPriceClearInputSchema = z.object({ listingId: z.string().min(1) });
