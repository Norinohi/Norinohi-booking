import { env } from "@yacht-charter/env/server";
import { Resend } from "resend";

let client: Resend | undefined;

function getClient() {
  if (!env.RESEND_API_KEY) return undefined;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

// Optional as a pair like Stripe/Google above: without RESEND_API_KEY and
// EMAIL_FROM, sends are skipped rather than the server failing to boot.
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const resend = getClient();
  if (!resend || !env.EMAIL_FROM) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not configured, skipping send to ${to}`);
    return { skipped: true } as const;
  }

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { skipped: false, id: result.data?.id } as const;
}
