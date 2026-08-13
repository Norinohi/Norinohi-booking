import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { env } from "@yacht-charter/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isBrowser } from "@/utils/runtime";

export const QUERY_DEFAULTS = { queries: { staleTime: 60_000 } } as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: QUERY_DEFAULTS,
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

/*
 * A fresh client per server render, one shared client in the browser.
 *
 * A module-level singleton is shared by every SSR request for the life of the process, so
 * HydrationBoundary finds a route's prefetched queries already present and defers them to
 * an effect — which never runs on the server. The server then renders with no data while
 * the browser hydrates with it, which is a mismatch on every prefetched route.
 */
export function getQueryClient() {
  if (!isBrowser) return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

function getServerUrl(url: string) {
  const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (isBrowser) {
    return `${window.location.origin}${normalized}`;
  }

  /* Not every server runtime we deploy to defines `process`, so the access stays optional. */
  const processEnv = globalThis.process?.env;
  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return `${origin}${normalized}`;
  }

  return `http://localhost:3000${normalized}`;
}
export const link = new RPCLink({
  url: `${getServerUrl(env.NEXT_PUBLIC_SERVER_URL)}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  headers: async () => {
    if (isBrowser) {
      return {};
    }

    const { headers } = await import("next/headers");
    return Object.fromEntries(await headers());
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

/*
 * The public half of the API, reached without forwarding the incoming request headers.
 *
 * The link above forwards every header so session-bearing procedures see the caller's cookies.
 * That is required for `protectedProcedure`, and fatal for caching: `headers()` may not be read
 * inside `"use cache"`, so as long as a read goes through it, no public read can ever be cached
 * and its route cannot prerender. Every read behind the marketing and search routes is a
 * `publicProcedure` and does not depend on the session, so it uses this client instead.
 *
 * Query keys are derived from the procedure path and input alone, not from the client, so options
 * built here share cache entries with the client-side hooks. See docs/adr/0002.
 */
export const publicLink = new RPCLink({
  url: `${getServerUrl(env.NEXT_PUBLIC_SERVER_URL)}/rpc`,
});

export const publicClient: AppRouterClient = createORPCClient(publicLink);

export const publicOrpc = createTanstackQueryUtils(publicClient);
