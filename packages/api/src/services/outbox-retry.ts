/*
 * When the outbox tries again, and when it stops.
 *
 * Apart from the drain so it can be read on its own: the attempt counter is written by
 * one statement and consulted by another, and the two agree only by arithmetic. Nothing
 * here touches the database or the mailer, which is what makes it testable.
 */

/**
 * How many times a message may be claimed before it is given up on. Counted at claim
 * rather than at failure, so a send that crashes the process still costs an attempt and
 * a message that reliably kills its worker cannot be retried forever.
 */
export const MAX_ATTEMPTS = 6;

/**
 * How long a claim holds a message. Long enough to cover a slow Resend call and short
 * enough that a killed container's work is retried within a cron tick.
 */
export const LEASE_MS = 2 * 60 * 1000;

/**
 * Backoff before the next attempt, indexed by attempts already made. Starts at a minute,
 * because most failures here are a mailer that is briefly unhappy, and ends a few hours
 * out, which is where a human should be looking at it instead.
 */
const BACKOFF_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

/** The wait after `attemptsMade` failed attempts, holding at the last step. */
export function backoffMs(attemptsMade: number): number {
  const step = Math.min(Math.max(attemptsMade, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[step] ?? 0;
}

export function isExhausted(attemptsMade: number): boolean {
  return attemptsMade >= MAX_ATTEMPTS;
}
