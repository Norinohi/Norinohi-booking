import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    /*
     * Shared with the Hono server, which posts here after a provider sync to drop
     * the cached catalog reads (docs/adr/0002). Optional like the other secrets:
     * unset makes the revalidate route refuse every request rather than stopping
     * the app from booting, and `next.config.ts` validates this module at build.
     */
    REVALIDATE_SECRET: z.string().min(16).optional(),
    /*
     * Server-side half of the observability drains, mirroring the same names in
     * @yacht-charter/env/server: the Next.js server runs its own evlog instance, so
     * route handlers and server components report through these rather than through
     * the Hono server's copy. Unset registers no drain at all.
     */
    SENTRY_DSN: z.url().optional(),
    POSTHOG_API_KEY: z.string().min(1).optional(),
    POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    OBSERVABILITY_ENVIRONMENT: z.string().min(1).optional(),
    OBSERVABILITY_RELEASE: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3001"),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
    NEXT_PUBLIC_MAPBOX_TOKEN: z.string().startsWith("pk."),
    /*
     * Optional, mirroring STRIPE_SECRET_KEY on the server: unset leaves the card tab
     * showing its unavailable notice instead of failing the build, so the invoice and
     * enquiry paths keep working without payment credentials.
     */
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
    // Scheduling link for the Calendly embed on /plan-my-trip/consultation. Optional —
    // without it, the "book a call" option falls back to the send-a-message form.
    NEXT_PUBLIC_CALENDLY_URL: z.url().optional(),
    /*
     * Browser-side analytics. Separate from POSTHOG_API_KEY above because the
     * server key is read at request time and this one is inlined into the client
     * bundle: a PostHog project key is publishable, a rotation story is not shared
     * between the two, and only this half can measure anything the user does
     * without hitting our server. Unset makes `track()` a no-op.
     */
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
  },
  runtimeEnv: {
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CALENDLY_URL: process.env.NEXT_PUBLIC_CALENDLY_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    SENTRY_DSN: process.env.SENTRY_DSN,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    OBSERVABILITY_ENVIRONMENT: process.env.OBSERVABILITY_ENVIRONMENT,
    OBSERVABILITY_RELEASE: process.env.OBSERVABILITY_RELEASE,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
