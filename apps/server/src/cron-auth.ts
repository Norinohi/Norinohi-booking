import { timingSafeEqual } from "node:crypto";

import { createMiddleware } from "hono/factory";

/**
 * Guards a scheduled route with a shared secret rather than a session, because the caller is a
 * scheduler with no user. Applied per route, not on `/api/cron/*`: a method no route matches must
 * still fall through to the oRPC dispatch and its 404, as it did before.
 */
export function requireCronSecret(secret: string | undefined) {
  return createMiddleware(async (c, next) => {
    if (!secret) {
      return c.json({ error: "CRON_SECRET is not configured" }, 503);
    }

    const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    // Constant-time compare so a wrong secret cannot be discovered byte by byte.
    if (!presented || !timingSafeEqualString(presented, secret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}

/** Length-safe wrapper: timingSafeEqual throws when the buffers differ in size. */
function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
