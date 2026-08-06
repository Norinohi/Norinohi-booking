import { z } from "zod";

import { paginationSchema } from "./catalog";

export const leadKindSchema = z.enum(["quote_request", "charter_expert", "consultation"]);
export const leadStatusSchema = z.enum(["new", "contacted", "closed"]);

/**
 * Public input — none of the three entry points require an account, so this is
 * deliberately small. `context` is free-form because each entry point carries
 * something different: search filters, planner answers, or the dates and guests
 * showing on the yacht sidebar.
 */
export const leadCreateInputSchema = z
  .object({
    kind: leadKindSchema,
    listingId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    email: z.email(),
    phone: z.string().trim().max(32).optional(),
    message: z.string().trim().max(2000).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "quote_request" && !value.listingId) {
      ctx.addIssue({
        code: "custom",
        message: "listingId is required when requesting a quote for a yacht",
        path: ["listingId"],
      });
    }
  });

/** What the visitor gets back — deliberately no internal fields. */
export const leadCreatedSchema = z.object({
  id: z.string(),
  kind: leadKindSchema,
  status: leadStatusSchema,
  createdAt: z.string(),
});

export const leadSchema = leadCreatedSchema.extend({
  listingId: z.string().nullable(),
  listingTitle: z.string().nullable(),
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  context: z.unknown().nullable(),
  handledAt: z.string().nullable(),
});

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export const leadListInputSchema = z
  .object({
    kind: leadKindSchema.optional(),
    status: leadStatusSchema.optional(),
    query: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
  })
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });

export const leadListSchema = z.object({
  items: z.array(leadSchema),
  pagination: paginationSchema,
});

export const leadSetStatusInputSchema = z.object({
  id: z.string().min(1),
  status: leadStatusSchema,
});
