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

try {
  await fetch(url, { signal: AbortSignal.timeout(5000) });
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

/*
 * The catalog routes enumerate their params from `charterSearch.catalogPages`, so a server older
 * than this build answers 404 and Next fails during page collection naming only the route. Deploys
 * hit this whenever web and the API roll out together and web wins the race.
 */
const probe = new URL("/rpc/charterSearch/catalogPages", url);

let response;

try {
  response = await fetch(probe, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: {} }),
    signal: AbortSignal.timeout(20000),
  });
} catch (error) {
  console.error(
    `\n✖ The API server at ${url} did not answer ${probe.pathname}\n\n` +
      `  Underlying error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

if (response.status === 404) {
  console.error(
    `\n✖ The API server at ${url} does not serve ${probe.pathname}\n\n` +
      "  Usually it is running an older build than this one. The catalog routes read that\n" +
      "  procedure to enumerate their static params, so the build would fail during page\n" +
      "  collection.\n\n" +
      "  On Railway: wait for the api service to finish deploying, then redeploy web.\n" +
      "  Locally: restart `pnpm dev:server` so it picks up the current packages/api.\n" +
      "  If the procedure was renamed, this preflight is the stale side — fix the path above.\n",
  );
  process.exit(1);
}

if (!response.ok) {
  console.error(
    `\n✖ The API server at ${url} answered ${response.status} for ${probe.pathname}\n\n` +
      "  The catalog routes read that procedure during prerender, so the build cannot proceed.\n" +
      "  Check the server logs; a failing database connection usually shows up here first.\n",
  );
  process.exit(1);
}
