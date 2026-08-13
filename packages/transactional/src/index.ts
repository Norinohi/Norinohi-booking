import { render } from "@react-email/render";
import { env } from "@yacht-charter/env/server";
import { createElement } from "react";
import { Resend } from "resend";

import { ResetPasswordEmail } from "./emails/reset-password";

let client: Resend | undefined;

function getClient() {
  if (!env.RESEND_API_KEY) return undefined;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

// Optional as a pair like the Google/Stripe keys: without RESEND_API_KEY and EMAIL_FROM
// sends are skipped rather than the server failing to boot. Callers read `skipped` to
// decide whether to surface the link some other way (e.g. a local dev log).
async function sendHtml(to: string, subject: string, html: string) {
  const resend = getClient();
  if (!resend || !env.EMAIL_FROM) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not configured, skipping send to ${to}`);
    return { skipped: true } as const;
  }

  const result = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { skipped: false, id: result.data?.id } as const;
}

export async function sendResetPasswordEmail({ to, url }: { to: string; url: string }) {
  // The footer links back to the deployed web app; CORS_ORIGIN is that origin.
  const html = await render(createElement(ResetPasswordEmail, { url, appUrl: env.CORS_ORIGIN }));
  return sendHtml(to, "Reset your YachtSkanner password", html);
}
