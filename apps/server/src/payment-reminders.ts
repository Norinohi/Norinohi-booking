/**
 * The scheduled balance reminder, run from the deployed container — same pattern as
 * sweep-expiries.ts. Calls the same `sendBalanceReminders` as POST
 * /api/cron/payment-reminders and admin.maintenance.sendPaymentReminders, so the three
 * cannot drift apart. The HTTP route stays as the manual escape hatch for sending the
 * batch after a mailer outage.
 *
 * Safe to repeat and safe to overlap: each installment's `reminder_sent_at` is claimed
 * in the statement that selects it, so a second run finds nothing left to mail.
 *
 * Refuses to start without a mailer configured. The claim is written before the send and
 * the send is best-effort, so an unset RESEND_API_KEY does not fail anything: it marks
 * every due installment reminded, mails nobody, and the reminder is unrecoverable. A red
 * run on the first tick is the only way that gets noticed.
 */
import { sendBalanceReminders } from "@yacht-charter/api/services/payment-reminders";
import { db } from "@yacht-charter/db";
import { env } from "@yacht-charter/env/server";
import { startJob } from "./job";

const job = startJob("payment-reminders");

if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
  console.error(
    "RESEND_API_KEY and EMAIL_FROM are required here: without them every due installment is claimed as reminded and nothing is sent",
  );
  await job.failed("no mailer configured");
  process.exit(1);
}

const result = await sendBalanceReminders(db);

console.log(JSON.stringify(result, null, 2));

// An idle pool client holds the event loop open. Harmless when a person runs this and
// walks away, fatal on a schedule: Railway reads a container that never exits as a run
// still in progress and skips every tick behind it.
await db.$client.end();

await job.done({ sent: result.sent, skipped: result.skipped });
