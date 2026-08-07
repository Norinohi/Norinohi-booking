import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    // Parent domain shared by the web and API hosts (e.g. ".yachtskanner.com"),
    // used as the session cookie's Domain attribute. Without it better-auth
    // writes a host-only cookie that the API subdomain can set but the web
    // subdomain never receives, so server-side getSession always sees no
    // session. Leave unset in local dev — web and API share the `localhost`
    // host, and cookies ignore ports.
    COOKIE_DOMAIN: z
      .string()
      .min(1)
      .refine((value) => !value.includes("://") && !value.includes("/"), {
        message: "COOKIE_DOMAIN must be a bare domain (.example.com), not a URL",
      })
      .optional(),
    OPENAPI_SERVER_URL: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    PROVIDER_MODE: z.enum(["mock", "booking_manager", "nausys"]).default("mock"),
    // Optional as a pair: the Google sign-in button only works when both are set,
    // and packages/auth registers the provider only when both are present.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Optional as a pair, like the Google keys: without both, card checkout
    // reports NOT_IMPLEMENTED and the webhook route refuses to mount, rather than
    // the server failing to boot.
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Shared secret for the scheduled maintenance endpoint. Unset means the route
    // refuses every request rather than running unauthenticated.
    CRON_SECRET: z.string().min(16).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
