import { z } from "zod";

import { paginatedSchema, paginationInputDefault, paginationInputSchema } from "./primitives";

export const USERS_PAGE_SIZE = 20;

export const userRoleSchema = z.enum(["customer", "staff", "admin"]);

/**
 * Where an account stands. `guest` is one guest checkout created on someone's behalf and nobody
 * has claimed by choosing a password; it is still an account that can book, so it is not folded
 * into `active`, which would hide exactly the customers support has to send a set-password link.
 */
export const userAccountStatusSchema = z.enum(["active", "guest", "deactivated"]);

export const userAdminSortSchema = z.enum(["newest", "mostBookings", "name"]);

export const userAdminListInputSchema = z
  .object({
    /** Matches a name, an email, or a phone number typed with or without its spacing. */
    query: z.string().trim().max(200).optional(),
    role: userRoleSchema.optional(),
    status: userAccountStatusSchema.optional(),
    /** True for customers who have booked, false for those who never have. */
    hasBookings: z.boolean().optional(),
    sort: userAdminSortSchema.default("newest"),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: USERS_PAGE_SIZE }),
  })
  .default({ ...paginationInputDefault(USERS_PAGE_SIZE), sort: "newest" });

export const userAdminRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  emailVerified: z.boolean(),
  /** The profile's number where the customer set one, otherwise the one given at signup. */
  phone: z.string().nullable(),
  role: userRoleSchema,
  status: userAccountStatusSchema,
  /** Every booking except the ones marked as not real business, whatever their state. */
  bookingCount: z.number().int(),
  confirmedBookingCount: z.number().int(),
  lastBookingAt: z.string().nullable(),
  createdAt: z.string(),
});

export const userAdminListSchema = paginatedSchema(userAdminRowSchema);
