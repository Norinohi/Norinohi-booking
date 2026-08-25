import { index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

/*
 * Work a request wrote down instead of doing.
 *
 * Guest checkout used to provision the account and mail the invitation inside the call that
 * created the booking, so the customer waited on better-auth minting a token and on Resend
 * accepting two messages before the confirmation screen appeared. None of that is anything
 * the answer depends on: the booking exists, the hold is secured, the access token is minted.
 * Writing a row here is one insert, and a drain that runs after the response does the rest.
 *
 * Durable rather than a promise nobody awaited, because the two things being deferred are the
 * only way a guest reaches their own account and the only record they have of the booking. A
 * deploy landing in the half-second between the response and the send would lose both, and
 * neither has anywhere else to come from.
 */
/*
 * `release_option` is the odd one out: not a message to anybody, but the same problem shaped the
 * same way. A provider option we failed to hand back has to be retried until it lands or is
 * given up on loudly, and this table already owns claim, backoff, attempts and exhaustion.
 */
export const outboxKind = pgEnum("outbox_kind", [
  "account_invitation",
  "booking_received",
  "release_option",
]);

export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);

export const outboxMessage = pgTable(
  "outbox_message",
  {
    id: id("obx"),
    kind: outboxKind("kind").notNull(),
    /**
     * What the message is about — a user id, a booking id — and all a handler is given.
     * Everything else it needs is read at send time, so a message that waited out a
     * retry describes the booking as it is now rather than as it was when enqueued.
     *
     * Unique with the kind, which is what stops an idempotent resubmit from mailing
     * the same person twice: the second enqueue writes nothing.
     */
    subjectId: text("subject_id").notNull(),
    status: outboxStatus("status").default("pending").notNull(),
    /**
     * Incremented when a worker claims the row, not when it fails, so a process that
     * dies mid-send still counts against the cap and a poisonous message cannot be
     * retried forever.
     */
    attempts: integer("attempts").default(0).notNull(),
    /**
     * When this row may next be claimed. Doubles as the lease: claiming pushes it
     * past the send it is about to attempt, so a worker that dies leaves the message
     * to the next drain rather than stranding it in a `sending` state nobody clears.
     */
    availableAt: timestamp("available_at").defaultNow().notNull(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at"),
    ...timestamps,
  },
  (t) => [
    unique("outbox_kind_subject_uq").on(t.kind, t.subjectId),
    index("outbox_due_idx").on(t.status, t.availableAt),
  ],
);
