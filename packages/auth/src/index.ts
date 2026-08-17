import { createDb } from "@yacht-charter/db";
import * as schema from "@yacht-charter/db/schema/auth";
import { env } from "@yacht-charter/env/server";
import { betterAuth, type BetterAuthAdvancedOptions } from "better-auth";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { sendResetPasswordEmail, sendSetPasswordEmail } from "@yacht-charter/transactional";

/*
 * better-auth has one reset-password token and one sender for it, but two audiences: someone
 * who forgot a password, and someone whose account was provisioned for them and has never had
 * one. The caller distinguishes them by putting `welcome=1` on the redirect it asks for, which
 * better-auth carries through to the link this sender receives. Matched on the parsed query
 * rather than a substring so a marina name containing the word cannot flip the template.
 */
const WELCOME_FLAG = "welcome";

/*
 * better-auth defaults to a 7-day session refreshed at most once a day. Seven days
 * signs a customer out between one visit and the next, which on a charter site means
 * re-authenticating to look at a booking they made last week. Thirty days is the
 * lifetime; the refresh window stays at a day, so an active session is extended by a
 * single write per day rather than on every request.
 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function isFirstPasswordLink(url: string): boolean {
  try {
    const target = new URL(url);
    if (target.searchParams.get(WELCOME_FLAG) === "1") return true;
    // Before the redirect hop the destination is still nested in `callbackURL`.
    const callback = target.searchParams.get("callbackURL");
    return callback ? new URL(callback).searchParams.get(WELCOME_FLAG) === "1" : false;
  } catch {
    return false;
  }
}

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

  // The web app and the API live on sibling subdomains in production
  // (www.* and api.*). better-auth only emits a Domain attribute when
  // crossSubDomainCookies is enabled; without it the session cookie is
  // host-only to the API host, so the web host never receives it and every
  // server-side getSession() reads an empty cookie jar. Unset locally,
  // where both sides already share the `localhost` cookie host.
  //
  // SameSite=None requires Secure, and Secure over plain http is a cookie the browser
  // stores nowhere — sign-in returns 200 with a user and the very next getSession() is
  // null, with nothing in the response to say why. Chrome makes an exception for
  // localhost; Safari and Firefox do not. So Secure tracks the scheme, and local http
  // dev gets the Lax cookie that works everywhere (both ports share the `localhost`
  // site, so Lax is still sent).
  //
  // None is narrower than Secure: it is needed only where the browser counts the two
  // hosts as different sites, and a browser decides that on the registrable domain, not
  // the subdomain. COOKIE_DOMAIN being set says both hosts sit under one parent, which
  // is same-site, and Lax is sent on same-site requests of every kind. Choosing Lax
  // there keeps the session cookie out of the third-party-cookie blocking that None
  // opts it into (Safari ITP, Firefox total cookie protection, Chrome with third-party
  // cookies off), which expires it on the browser's schedule rather than ours. Over
  // https with COOKIE_DOMAIN unset the two cases are indistinguishable from here, so
  // the cross-site pair stays the fallback.
  const isHttps = env.BETTER_AUTH_URL.startsWith("https://");
  const crossSite = isHttps && !env.COOKIE_DOMAIN;
  const advanced: BetterAuthAdvancedOptions = {
    // Undefined leaves better-auth's own `better-auth` default in place.
    cookiePrefix: env.COOKIE_PREFIX,
    defaultCookieAttributes: {
      sameSite: crossSite ? "none" : "lax",
      secure: isHttps,
      httpOnly: true,
    },
  };
  if (env.COOKIE_DOMAIN) {
    advanced.crossSubDomainCookies = { enabled: true, domain: env.COOKIE_DOMAIN };
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        const result = isFirstPasswordLink(url)
          ? await sendSetPasswordEmail({ to: user.email, url, name: user.name })
          : await sendResetPasswordEmail({ to: user.email, url });
        // Without Resend configured the send is skipped. Surface the link in the server
        // log outside production so the flow is completable locally.
        if (result.skipped && env.NODE_ENV !== "production") {
          console.warn(`[auth] password reset link for ${user.email}: ${url}`);
        }
      },
      onPasswordReset: async ({ user }) => {
        // A forgotten password may mean a compromised account: drop every existing
        // session so a reset also signs the account out everywhere. The reset token
        // itself is already single-use.
        await db.delete(schema.session).where(eq(schema.session.userId, user.id));
      },
    },
    socialProviders,
    user: {
      additionalFields: {
        phone: {
          type: "string",
          required: false,
        },
        // Expose the role column in session payloads (better-auth strips undeclared
        // fields from responses). `input: false` keeps sign-up from self-assigning it.
        role: {
          type: "string",
          required: false,
          input: false,
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
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced,
    plugins: [
      openAPI({
        theme: "default",
      }),
    ],
  });
}

export const auth = createAuth();
