import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { booking } from "@yacht-charter/db/schema/booking";
import { eq } from "drizzle-orm";

import type { Database } from "../context";

/*
 * How someone who never signed in reaches their own booking.
 *
 * Guest checkout provisions an account but issues no session (a typed email is not
 * proof of anything), so the booking-scoped procedures accept a bearer token instead.
 * The token authorises exactly one booking, and every service behind it keeps taking
 * the owning user id — the token resolves to that id here, at the edge, so nothing
 * downstream has to know two kinds of caller exist.
 */

const TOKEN_BYTES = 32;

export type GuestAccessToken = {
  /** Handed to the browser once. Never stored, never logged. */
  token: string;
  /** What the booking row keeps, so a stolen dump yields no working links. */
  tokenHash: string;
};

export function mintGuestAccessToken(): GuestAccessToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Who is acting on this booking: the signed-in user, or the holder of its guest token.
 *
 * Returns a user id either way. A session wins outright and is checked for ownership
 * downstream by `readOwnedBooking`, which is why a signed-in stranger presenting
 * someone else's token still gets their own id and reads as NOT_FOUND.
 */
export async function resolveBookingActor(
  db: Database,
  sessionUserId: string | undefined,
  bookingId: string,
  accessToken: string | undefined,
): Promise<string> {
  if (sessionUserId) return sessionUserId;

  if (!accessToken) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Sign in, or use the link from your booking confirmation",
    });
  }

  const [row] = await db
    .select({ userId: booking.userId, tokenHash: booking.guestAccessTokenHash })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  // Same answer for an unknown booking and a wrong token: distinguishing them turns
  // this into an oracle for which booking ids exist.
  if (!row?.tokenHash || !matches(row.tokenHash, accessToken)) {
    throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });
  }

  return row.userId;
}

function matches(storedHash: string, presented: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(hashToken(presented), "hex");
  // Equal by construction — both are SHA-256 digests — but timingSafeEqual throws
  // rather than returning false when they are not, so the guard stays.
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(stored, candidate);
}
