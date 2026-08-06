import { z } from "zod";

import { moneySchema, paginationSchema } from "./catalog";

export const paymentScheduleKindSchema = z.enum([
  "deposit",
  "balance",
  "full",
  "checkin_extras",
  "security_deposit",
]);

export const paymentStatusSchema = z.enum([
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "refunded",
]);

export const bookingStatusSchema = z.enum([
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
]);

/**
 * One My Bookings card (Figma 972:54737). Everything here comes from the booking's
 * frozen commercial snapshot, so a card keeps rendering after the listing changes
 * or the provider withdraws it.
 */
export const bookingSummarySchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  listing: z.object({
    id: z.string(),
    title: z.string(),
    mainImage: z.string().nullable(),
    gallery: z.array(z.string()),
    rating: z.number(),
    reviewCount: z.number().int(),
    category: z.string().nullable(),
    crewType: z.string().nullable(),
  }),
  base: z.object({
    name: z.string(),
    locationName: z.string(),
    countryName: z.string(),
  }),
  /** ISO datetimes — the card shows "7 July, 2026 17:00 → 25 July, 2026 22:00". */
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int(),
  total: moneySchema,
  paidTotal: moneySchema,
  balanceDue: moneySchema,
  nextPaymentDueAt: z.string().nullable(),
  cancellable: z.boolean(),
  createdAt: z.string(),
});

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

export const bookingListInputSchema = z
  .object({
    /** The "Any dates" filter; matched against the charter period, not booked-on. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: z.array(bookingStatusSchema).optional(),
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  })
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: "custom", message: "to must be on or after from", path: ["to"] });
    }
  });

export const bookingListSchema = z.object({
  items: z.array(bookingSummarySchema),
  pagination: paginationSchema,
});

export const bookingIdInputSchema = z.object({ id: z.string().min(1) });

/**
 * Detail for "View Details". Travellers are deliberately absent: §10 forbids
 * returning crew and passport data from this endpoint.
 */
export const bookingDetailSchema = bookingSummarySchema.extend({
  provider: z.string(),
  providerReservationId: z.string().nullable(),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  priceLines: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      amount: moneySchema,
    }),
  ),
  extras: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      pricingType: z.string().nullable(),
      amount: moneySchema.nullable(),
    }),
  ),
  paymentPolicy: z.object({
    mode: z.enum(["deposit", "full"]),
    depositPct: z.number(),
    balanceDueAt: z.string().nullable(),
  }),
  paymentSchedule: z.array(
    z.object({
      id: z.string(),
      kind: paymentScheduleKindSchema,
      amount: moneySchema,
      dueAt: z.string().nullable(),
      status: z.enum(["pending", "paid", "cancelled"]),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      kind: paymentScheduleKindSchema,
      amount: moneySchema,
      status: paymentStatusSchema,
      paidAt: z.string().nullable(),
    }),
  ),
});

export const bookingCancelInputSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const bookingCancelSchema = z.object({
  id: z.string(),
  status: bookingStatusSchema,
});

/* ------------------------------------------------------------------ checkout */

/** Step 1 of the accordion, submitted with Confirm Booking rather than on its own. */
export const guestDetailsSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.email(),
  phone: z.string().trim().min(3).max(32),
  specialRequests: z.string().trim().max(2000).optional(),
});

/**
 * The two Review & Book checkboxes. Literal `true` rather than boolean on purpose:
 * an unticked box is a validation failure server-side, not something the client is
 * trusted to enforce.
 */
export const consentsSchema = z.object({
  terms: z.literal(true),
  cancellationPolicy: z.literal(true),
});

export const checkoutCreateHoldInputSchema = z.object({
  quoteId: z.string().min(1),
  guest: guestDetailsSchema,
  consents: consentsSchema,
  /** Supplied by the client so a retried submit cannot create a second booking. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const checkoutHoldSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  holdExpiresAt: z.string().nullable(),
  /** False when the provider has no option support and the hold step was skipped. */
  optionHeld: z.boolean(),
});

export const checkoutStatusInputSchema = z.object({ bookingId: z.string().min(1) });

export const checkoutStatusSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  providerReservationId: z.string().nullable(),
  /** Set when the booking failed, so the confirmation screen can explain why. */
  failureReason: z.string().nullable(),
});

/* --------------------------------------------- non-card checkout outcomes */

export const invoiceRequestInputSchema = z.object({
  bookingId: z.string().min(1),
  billingEmail: z.email(),
  companyName: z.string().trim().max(200).optional(),
  vatNumber: z.string().trim().max(64).optional(),
});

export const invoiceRequestSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  billingEmail: z.string(),
  companyName: z.string().nullable(),
  vatNumber: z.string().nullable(),
  amount: moneySchema,
  status: z.enum(["pending", "sent", "paid", "cancelled"]),
  bookingStatus: bookingStatusSchema,
  createdAt: z.string(),
});

export const enquiryInputSchema = z.object({
  bookingId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
});

export const enquirySchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  question: z.string(),
  status: z.enum(["open", "answered", "closed"]),
  answer: z.string().nullable(),
  answeredAt: z.string().nullable(),
  /** Unchanged by asking — a question is not a commitment to pay. */
  bookingStatus: bookingStatusSchema,
  createdAt: z.string(),
});

/** Data for "Download Receipt"; the PDF itself is rendered client-side. */
export const bookingReceiptSchema = z.object({
  reference: z.string(),
  issuedAt: z.string(),
  status: bookingStatusSchema,
  guest: z.object({
    fullName: z.string().nullable(),
    email: z.string().nullable(),
  }),
  listingTitle: z.string(),
  baseName: z.string(),
  locationName: z.string(),
  countryName: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int(),
  lines: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      amount: moneySchema,
      payWhen: z.enum(["now", "at_check_in"]),
    }),
  ),
  total: moneySchema,
  securityDeposit: moneySchema.nullable(),
  paidTotal: moneySchema,
  balanceDue: moneySchema,
  payments: z.array(
    z.object({
      kind: paymentScheduleKindSchema,
      amount: moneySchema,
      status: paymentStatusSchema,
      paidAt: z.string().nullable(),
    }),
  ),
});

export const checkoutConfirmInputSchema = z.object({
  bookingId: z.string().min(1),
  /** Overrides the quote's own policy when the customer chooses to pay in full. */
  paymentPreference: z.enum(["deposit", "full"]).default("deposit"),
});

export const checkoutConfirmSchema = z.object({
  bookingId: z.string(),
  status: bookingStatusSchema,
  paymentId: z.string(),
  amount: moneySchema,
  kind: paymentScheduleKindSchema,
  /** Handed to Stripe Elements in the browser; never stored server-side. */
  clientSecret: z.string(),
});

/* --------------------------------------------------- invoice administration */

export const invoiceListInputSchema = z
  .object({
    status: z.enum(["pending", "sent", "paid", "cancelled"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .default({ page: 1, pageSize: 20 });

export const invoiceAdminRowSchema = invoiceRequestSchema.extend({
  reference: z.string(),
  guestName: z.string().nullable(),
  listingTitle: z.string(),
  settledAt: z.string().nullable(),
});

export const invoiceListSchema = z.object({
  items: z.array(invoiceAdminRowSchema),
  pagination: paginationSchema,
});

export const invoiceSettleInputSchema = z.object({
  id: z.string().min(1),
  /** What actually landed, when it differs from the amount invoiced. */
  amountMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});

export const invoiceSettleSchema = z.object({
  invoice: invoiceAdminRowSchema,
  bookingStatus: bookingStatusSchema,
  /** Set when the provider refused after the money arrived. */
  providerRejection: z.string().nullable(),
});

export const invoiceCancelInputSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});
