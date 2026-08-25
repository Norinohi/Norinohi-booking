import { outboxMessage } from "@yacht-charter/db/schema/outbox";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../context";
import { sendAccountInvitation } from "./account-invitation";
import { sendBookingReceivedNotice } from "./booking-received";
import { retryOptionRelease } from "./provider-option";
import { LEASE_MS, backoffMs, isExhausted } from "./outbox-retry";

/*
 * The drain behind the outbox table.
 *
 * Guest checkout writes two rows here and answers; this is what turns them into the
 * invitation and the confirmation mail afterwards. Two things run it: `kickOutbox`,
 * called by the request that enqueued, so the normal case still sends within a second
 * of the response; and the outbox cron, which is what makes an unlucky one recoverable
 * (docs/scheduled-jobs.md).
 *
 * Claiming is a lease, not a `sending` status. A worker takes a row by pushing
 * `available_at` past the send it is about to attempt, so a container that dies
 * mid-Resend leaves a message the next drain can pick up rather than one stuck in a
 * state nobody clears.
 */

export type OutboxKind = (typeof outboxMessage.kind.enumValues)[number];

/** `satisfies` rather than an annotation: still exhaustive over the enum, still one signature. */
const HANDLERS = {
  account_invitation: sendAccountInvitation,
  booking_received: sendBookingReceivedNotice,
  release_option: retryOptionRelease,
} satisfies Record<OutboxKind, (db: Database, subjectId: string) => Promise<void>>;

/** One drain claims at most this many messages, so a backlog is worked through in batches. */
const BATCH = 25;

/** How many batches one drain will work through before leaving the rest to the next run. */
const MAX_BATCHES = 20;

/**
 * Records work for the drain to do. Cheap enough to sit inside a request: one insert,
 * no network.
 *
 * Silently does nothing when the subject already has a message of this kind, which is
 * what a retried checkout relies on — the same booking must not be announced twice, and
 * `(kind, subject_id)` is the constraint that decides it rather than the caller.
 */
export async function enqueueOutbox(
  db: Database,
  kind: OutboxKind,
  subjectId: string,
): Promise<void> {
  await db
    .insert(outboxMessage)
    .values({ kind, subjectId })
    .onConflictDoNothing({ target: [outboxMessage.kind, outboxMessage.subjectId] });
}

export type DrainResult = {
  sent: number;
  /** Messages whose send failed and that are waiting on their backoff. */
  retrying: number;
  /** Messages that ran out of attempts. Each one is a mail somebody never got. */
  failed: number;
};

export async function drainOutbox(db: Database, now: Date = new Date()): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, retrying: 0, failed: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const claimed = await claim(db, now);
    if (claimed.length === 0) return result;

    for (const message of claimed) {
      const outcome = await deliver(db, message);
      result[outcome] += 1;
    }
  }

  return result;
}

type ClaimedMessage = { id: string; kind: OutboxKind; subjectId: string; attempts: number };

/**
 * Takes up to a batch of due messages, incrementing their attempt count and pushing
 * `available_at` out by the lease in the same statement that selects them. `for update
 * skip locked` is what lets the cron and a request-time kick run at the same moment
 * without either waiting on the other or both sending the same mail.
 */
async function claim(db: Database, now: Date): Promise<ClaimedMessage[]> {
  const due = db
    .select({ id: outboxMessage.id })
    .from(outboxMessage)
    .where(and(eq(outboxMessage.status, "pending"), lte(outboxMessage.availableAt, now)))
    // Oldest due first, and within one moment in the order they were written: checkout
    // enqueues the invitation and then the confirmation, and that is the order to send them.
    .orderBy(asc(outboxMessage.availableAt), asc(outboxMessage.createdAt))
    .limit(BATCH)
    .for("update", { skipLocked: true });

  return db
    .update(outboxMessage)
    .set({
      attempts: sql`${outboxMessage.attempts} + 1`,
      // From the clock, not from `now`: that one is the due cutoff and is deliberately
      // fixed for the whole drain, so a long backlog would otherwise hand its last batch
      // a lease that had already run out.
      availableAt: new Date(Date.now() + LEASE_MS),
    })
    .where(inArray(outboxMessage.id, due))
    .returning({
      id: outboxMessage.id,
      kind: outboxMessage.kind,
      subjectId: outboxMessage.subjectId,
      attempts: outboxMessage.attempts,
    });
}

async function deliver(db: Database, message: ClaimedMessage): Promise<keyof DrainResult> {
  try {
    await HANDLERS[message.kind](db, message.subjectId);
  } catch (cause) {
    console.error(
      `[outbox] ${message.kind} for ${message.subjectId} failed on attempt ${message.attempts}`,
      cause,
    );

    const exhausted = isExhausted(message.attempts);

    await db
      .update(outboxMessage)
      .set({
        status: exhausted ? "failed" : "pending",
        availableAt: new Date(Date.now() + backoffMs(message.attempts)),
        lastError: describe(cause),
      })
      .where(eq(outboxMessage.id, message.id));

    return exhausted ? "failed" : "retrying";
  }

  await db
    .update(outboxMessage)
    .set({ status: "sent", sentAt: new Date(), lastError: null })
    .where(eq(outboxMessage.id, message.id));

  return "sent";
}

/** Whatever was thrown, rendered for a text column somebody will read in Studio. */
function describe(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.slice(0, 500);
}

/*
 * The request-time half of the drain: started, deliberately not awaited, by whatever
 * enqueued. The point of the outbox is that the answer does not wait on the mail, so a
 * caller that awaited this would have given all of it back.
 *
 * Serialised through a single in-flight promise per process. Checkout enqueues twice and
 * kicks once, but two customers checking out together would otherwise start two drains
 * that claim past each other; one run, re-armed if a kick arrives while it is going,
 * covers both without the second claiming an empty batch.
 */
let running: Promise<void> | null = null;
let rearm = false;

export function kickOutbox(db: Database): void {
  if (running) {
    rearm = true;
    return;
  }

  running = drainOutbox(db)
    .then(() => undefined)
    .catch((cause: unknown) => {
      console.error("[outbox] drain failed", cause);
    })
    .finally(() => {
      running = null;
      if (rearm) {
        rearm = false;
        kickOutbox(db);
      }
    });
}
