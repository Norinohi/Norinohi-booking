import { createDb } from "@yacht-charter/db";
import * as schema from "@yacht-charter/db/schema/auth";
import { env } from "@yacht-charter/env/server";
import { betterAuth } from "better-auth";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        phone: {
          type: "string",
          required: false,
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
