import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { listing } from "./listing";

// Top of the funnel: unlike booking_enquiry, a lead has no booking and usually no
// account. Only quote_request carries a listing.
export const leadKind = pgEnum("lead_kind", ["quote_request", "charter_expert", "consultation"]);

export const leadStatus = pgEnum("lead_status", ["new", "contacted", "closed"]);

export const lead = pgTable(
  "lead",
  {
    id: id("lead"),
    kind: leadKind("kind").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    listingId: text("listing_id").references(() => listing.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    // Search filters, planner answers or sidebar dates — shape varies per entry
    // point and is only ever read back.
    context: jsonb("context"),
    // The reply staff sent from the inbox, kept for the same reason booking_enquiry keeps
    // one: the email leaves no trace here, so without it nobody can see what was answered.
    answer: text("answer"),
    answeredAt: timestamp("answered_at"),
    status: leadStatus("status").default("new").notNull(),
    handledByUserId: text("handled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    handledAt: timestamp("handled_at"),
    ...timestamps,
  },
  (t) => [
    index("lead_status_idx").on(t.status),
    index("lead_kind_idx").on(t.kind),
    index("lead_created_idx").on(t.createdAt),
    index("lead_email_idx").on(t.email),
  ],
);

export const leadRelations = relations(lead, ({ one }) => ({
  user: one(user, { fields: [lead.userId], references: [user.id] }),
  listing: one(listing, { fields: [lead.listingId], references: [listing.id] }),
}));
