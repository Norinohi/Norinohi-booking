/*
 * The server env the checkout suites run under, set before anything reads it.
 *
 * Imported first by each suite: `@yacht-charter/env/server` parses `process.env` once, when it is
 * first loaded, and ESM evaluates a file's imports in the order they are written. Validation is
 * kept on rather than skipped, because skipping it also skips the defaults, and the offer timeout
 * read as undefined abandons every quote before the provider answers.
 *
 * The connection string is one nothing listens on: the suites pass their own database to every
 * service, so a query that reaches the process-wide pool is a bug and should fail loudly. The
 * Stripe pair is fake and only ever used offline, to build a client whose calls the suites
 * replace and to sign the events they deliver. Everything that would reach the network on its
 * own - mail, cache revalidation, error tracking - is unset.
 */
const env = process.env;

export const WEBHOOK_SECRET = "whsec_checkout_suite";

/* No `.env` of a developer's may add a mail key back after the deletes below. */
env.DOTENV_CONFIG_PATH = "./.env.checkout-suite-does-not-exist";

env.DATABASE_URL = "postgresql://nobody@127.0.0.1:1/none";
env.BETTER_AUTH_SECRET = "checkout-suite-secret-0123456789abcdef";
env.BETTER_AUTH_URL = "http://localhost:3000";
env.CORS_ORIGIN = "http://localhost:3001";
env.NODE_ENV = "test";
env.PROVIDER_MODE = "mock";
env.STRIPE_SECRET_KEY = "sk_test_checkout_suite";
env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

for (const name of [
  "SKIP_ENV_VALIDATION",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STAFF_EMAIL",
  "REVALIDATE_SECRET",
  "SENTRY_DSN",
  "BUNNY_MEDIA_SYNC_ENABLED",
]) {
  delete env[name];
}
