import { env } from "@yacht-charter/env/web";
import { createAuthClient } from "better-auth/react";
import { z } from "zod";

import { isBrowser } from "@/utils/runtime";

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
export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: new URL("/api/auth", getServerUrl(env.NEXT_PUBLIC_SERVER_URL)).toString(),
});

export type SessionUser = typeof authClient.$Infer.Session.user;

/*
 * The `role` column is not in the auth client's types, so it is read off the session user
 * through a schema rather than asserted (the same convention as the API's staffProcedure).
 */
const roleSchema = z.object({ role: z.string() });

export function userRole(user: SessionUser | null | undefined): string | null {
  return user ? (roleSchema.safeParse(user).data?.role ?? null) : null;
}

/** The same staff/admin gate the API's staffProcedure applies. */
export function isStaffRole(role: string | null): boolean {
  return role === "staff" || role === "admin";
}
