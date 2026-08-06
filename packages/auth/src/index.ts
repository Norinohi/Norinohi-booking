import { createDb } from "@yacht-charter/db";
import * as schema from "@yacht-charter/db/schema/auth";
import { env } from "@yacht-charter/env/server";
import { betterAuth } from "better-auth";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";

export function createAuth() {
  const db = createDb();

  // Registered only when both halves of the credential pair are configured, so a
  // local `.env` without Google keys still boots. The callback better-auth mounts
  // is `${BETTER_AUTH_URL}/api/auth/callback/google` — register that exact URI in
  // the Google console, and keep the `/api/auth` mount identical on both sides.
  const socialProviders =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    user: {
      additionalFields: {
        phone: {
          type: "string",
          required: false,
        },
        // requireAdmin in packages/api reads session.user.role, and better-auth
        // only puts declared fields on the session — without this every admin
        // procedure returns FORBIDDEN even for a staff account.
        // `input: false` is load-bearing: it stops a signup request from
        // supplying its own role and self-promoting to admin.
        role: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "customer",
        },
      },
      changeEmail: {
        enabled: true,
        // No email-verification infrastructure exists yet, and every account is
        // unverified — without this flag better-auth rejects every change-email
        // request with 400 "Verification email isn't enabled".
        updateEmailWithoutVerification: true,
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            // reactivate a soft-deactivated user on login
            await db
              .update(schema.user)
              .set({ deactivatedAt: null })
              .where(and(eq(schema.user.id, session.userId), isNotNull(schema.user.deactivatedAt)));
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // The web app and the API live on sibling subdomains in production
      // (www.* and api.*). better-auth only emits a Domain attribute when
      // crossSubDomainCookies is enabled; without it the session cookie is
      // host-only to the API host, so the web host never receives it and every
      // server-side getSession() reads an empty cookie jar. Unset locally,
      // where both sides already share the `localhost` cookie host.
      ...(env.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
        : {}),
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      openAPI({
        theme: "default",
      }),
    ],
  });
}

export const auth = createAuth();
