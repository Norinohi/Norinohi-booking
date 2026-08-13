import { timingSafeEqual } from "node:crypto";
import { env } from "@yacht-charter/env/web";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isKnownCacheTag } from "@/lib/cache-tags";

/**
 * Drops cached catalog entries after a provider sync.
 *
 * The Hono server owns the sync and this app owns the cache, so invalidation has
 * to cross the service boundary; docs/adr/0002 anticipated exactly this webhook.
 * It sits under `/api`, which `proxy.ts` passes through without locale rewriting.
 *
 * Guarded the same way as the cron routes on the server side: a shared secret in
 * a bearer header, compared in constant time, and refusing outright when unset
 * rather than running open.
 */

const revalidateBodySchema = z.object({ tags: z.array(z.string()) });

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "REVALIDATE_SECRET is not configured" }, { status: 503 });
  }

  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented || !timingSafeEqualString(presented, env.REVALIDATE_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = revalidateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { tags: string[] }" }, { status: 400 });
  }

  // An allow-list rather than a passthrough: a caller that could name any tag
  // could drop cache entries this route has no business touching.
  const accepted = parsed.data.tags.filter(isKnownCacheTag);
  for (const tag of accepted) {
    // `{ expire: 0 }` rather than a named profile: the point of this call is that
    // an operator has just run a sync and wants to see it, so any tolerated
    // staleness is the same problem we are here to fix. `updateTag` would be the
    // stronger read-your-own-writes version but is only valid in a Server Action.
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ revalidated: accepted });
}
