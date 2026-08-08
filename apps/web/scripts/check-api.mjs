/*
 * Preflight for `next build`.
 *
 * The public catalog routes cache their reads, and a cached read executes during prerender to
 * fill the static shell — so the build calls the API server. When it is down, Next fails deep in
 * the prerender with a bare `TypeError: fetch failed` and `ECONNREFUSED`, naming no route, no URL
 * and no cause. This turns that into one sentence, before the build spends a minute compiling.
 *
 * Failing is deliberate rather than degrading to an empty catalog: a build that quietly succeeded
 * without data would ship a homepage claiming there are no destinations, and cache it. See
 * docs/adr/0002 and instant-nav.rig.md.
 */

const url = process.env.NEXT_PUBLIC_SERVER_URL;

if (!url) {
  console.error(
    "\n✖ NEXT_PUBLIC_SERVER_URL is not set — cannot reach the API to prerender the catalog routes.\n" +
      "  Copy apps/web/.env.example to apps/web/.env.\n",
  );
  process.exit(1);
}

const timeout = AbortSignal.timeout(5000);

try {
  await fetch(url, { signal: timeout });
} catch (error) {
  console.error(
    `\n✖ Cannot reach the API server at ${url}\n\n` +
      "  `next build` prerenders the catalog routes, and those reads go to this server, so the\n" +
      "  build cannot proceed without it.\n\n" +
      "  Start it first:\n" +
      "    pnpm db:start      # Postgres (published on 5434)\n" +
      "    pnpm dev:server    # API on :3000\n\n" +
      `  Underlying error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
