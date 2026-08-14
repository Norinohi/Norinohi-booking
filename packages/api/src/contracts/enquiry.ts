import { z } from "zod";

import {
  idSchema,
  paginatedSchema,
  paginationInputDefault,
  paginationInputSchema,
} from "./primitives";

/*
 * Booking enquiries — the questions a customer asks about a booking they already hold, from
 * the payment step's "ask a question" and from /support. They were written to `booking_enquiry`
 * and read by nothing, so these are the shapes that make them reachable.
 *
 * Distinct from `lead` (contracts/lead.ts), which is a pre-booking enquiry from someone who may
 * not have an account: this one always names a booking and a customer.
 */

export const enquiryStatusSchema = z.enum(["open", "answered", "closed"]);
export type EnquiryStatus = z.infer<typeof enquiryStatusSchema>;

const DEFAULT_PAGE_SIZE = 20;

export const enquiryListInputSchema = z
  .object({
    status: enquiryStatusSchema.optional(),
    /** Matched against the customer's email and the booking reference. */
    query: z.string().trim().max(200).optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

/** One row of the staff inbox: the question, and enough of the booking to answer it. */
export const enquiryRowSchema = z.object({
  id: z.string(),
  status: enquiryStatusSchema,
  question: z.string(),
  answer: z.string().nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
  bookingId: z.string(),
  reference: z.string(),
  bookingStatus: z.string(),
  listingTitle: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  customerName: z.string(),
  customerEmail: z.string(),
});

export const enquiryListSchema = paginatedSchema(enquiryRowSchema);

export const enquiryAnswerInputSchema = z.object({
  id: idSchema,
  answer: z.string().trim().min(1).max(4000),
  /** Answering closes it by default; `false` keeps it open for a follow-up. */
  close: z.boolean().default(true),
});

export const enquirySetStatusInputSchema = z.object({
  id: idSchema,
  status: enquiryStatusSchema,
});
