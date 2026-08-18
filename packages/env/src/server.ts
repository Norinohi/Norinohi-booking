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
    /*
     * Namespace for better-auth's cookie names, which must differ per deployment.
     * A browser keys a cookie by name, domain and path, so two environments under
     * one parent domain (staging and production both scoped to .yachtskanner.com)
     * write their session token into the same slot: signing in on one overwrites
     * the other's cookie, and the environment that then receives a token its own
     * database has never seen deletes the cookie and returns no session. Set this
     * on every non-production deployment. Production leaves it unset so it keeps
     * better-auth's `better-auth` default and existing sessions survive.
     */
    COOKIE_PREFIX: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_-]+$/, {
        message: "COOKIE_PREFIX must be letters, digits, hyphens or underscores only",
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
    // Optional as a pair: without both, email-sending is skipped rather than
    // the server failing to boot. EMAIL_FROM must be an address on a domain
    // verified in Resend (or the sandbox onboarding@resend.dev in dev).
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.email().optional(),
    /*
     * Where a customer's reply lands. EMAIL_FROM is a sending identity and is usually a
     * noreply, so without this every "just reply to this email" is a dead end. Unset means
     * no header, which is the old behaviour rather than a guessed address. Internal staff
     * alerts deliberately do not carry it.
     */
    REPLY_TO_EMAIL: z.email().optional(),
    /*
     * Where new enquiries and booking questions are announced. Unset means no internal
     * alert is sent — the staff inbox at /inbox still lists everything, so nothing is
     * lost, and there is no fallback address because guessing one would mail an internal
     * alert to a customer.
     */
    STAFF_EMAIL: z.email().optional(),
    // Shared secret for the scheduled maintenance endpoint. Unset means the route
    // refuses every request rather than running unauthenticated.
    CRON_SECRET: z.string().min(16).optional(),
    /*
     * Shared with the web app's /api/revalidate route, which drops the cached
     * catalog reads after a provider sync. Unset simply skips the notification:
     * the cache windows in docs/adr/0002 still catch up on their own, so a sync
     * must never fail because the web app could not be reached.
     */
    REVALIDATE_SECRET: z.string().min(16).optional(),
    /*
     * Provider codes whose listings publish as they import, comma separated
     * (e.g. "nausys"). Bootstrap only: `provider.config.autoPublish` overrides it
     * per provider, but that column needs database access, and an operator who
     * only has the deploy platform still has to be able to turn this on.
     */
    PROVIDER_AUTO_PUBLISH: z.string().optional(),
    // Base64 of 32 random bytes, encrypting PII at rest (architecture §10) —
    // today the identity-document fields on booking_traveller. Optional so the
    // server boots without it; the traveller procedures then refuse rather than
    // storing readable passport numbers. Generate with:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    ENCRYPTION_KEY: z.string().min(1).optional(),
    NAUSYS_BASE_URL: z.url().default("https://ws.nausys.com"),
    // Optional like the Stripe pair: without both, PROVIDER_MODE=nausys refuses to
    // construct the adapter instead of the server failing to boot.
    NAUSYS_USERNAME: z.string().min(1).optional(),
    NAUSYS_PASSWORD: z.string().min(1).optional(),
    NAUSYS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    // Idle gap between two calls on the same credential. NauSYS forbids parallel
    // calls outright; the spacing is our own politeness margin on top of that.
    NAUSYS_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(250),
    // We must release a hold before NauSYS auto-expires it, otherwise we sell a
    // slot the provider has already dropped.
    NAUSYS_OPTION_SAFETY_MARGIN_MINUTES: z.coerce.number().int().nonnegative().default(15),
    // `optionTill` carries no timezone; pending vendor question Q-OPT.
    NAUSYS_OPTION_TIMEZONE: z.string().min(1).default("Europe/Zagreb"),
    BOOKING_MANAGER_BASE_URL: z.url().default("https://www.booking-manager.com/api/v2"),
    // A Bearer token, not an API key - the bm-api spec declares `bearerAuth`.
    // Optional like the NauSYS pair: without it PROVIDER_MODE=booking_manager
    // refuses to construct the adapter instead of the server failing to boot.
    BOOKING_MANAGER_API_TOKEN: z.string().min(1).optional(),
    BOOKING_MANAGER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    // Booking Manager has not published a rate limit; pending vendor answer, this
    // is our own politeness margin.
    BOOKING_MANAGER_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(250),
    // We must release a hold before the vendor auto-expires it, otherwise we sell
    // a slot Booking Manager has already dropped.
    BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: z.coerce.number().int().nonnegative().default(15),
    // MMK support confirmed (Aug 2026) every non-/offers datetime is a fixed CET
    // clock that observes daylight saving, so this must stay a real IANA zone.
    BOOKING_MANAGER_TIMEZONE: z.string().min(1).default("Europe/Zagreb"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
