import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { listing } from "./listing";

/*
 * Pre-booking enquiries. Three places in the design lead here and they differ only
 * in where the visitor was standing:
 *   quote_request  — "Request Quote" on a yacht page (carries a listing)
 *   charter_expert — "Contact a charter expert" in the search filters and empty state
 *   consultation   — "Get Consultation" on the trip planner results
 *
 * Distinct from booking_enquiry, which hangs off an existing booking. A lead has no
 * booking and usually no account — this is the top of the funnel.
 */
export const leadKind = pgEnum("lead_kind", ["quote_request", "charter_expert", "consultation"]);

export const leadStatus = pgEnum("lead_status", ["new", "contacted", "closed"]);

export const lead = pgTable(
  "lead",
  {
    id: id("lead"),
    kind: leadKind("kind").notNull(),
    /** Null for anonymous visitors — none of the three entry points require signing in. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Set for quote_request; null when the enquiry is not about one yacht. */
    listingId: text("listing_id").references(() => listing.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    /**
     * Whatever the visitor was looking at — search filters, planner answers, or the
     * dates and guests on the yacht sidebar. Kept as jsonb because each entry point
     * carries a different shape and staff only ever read it.
     */
    context: jsonb("context"),
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
