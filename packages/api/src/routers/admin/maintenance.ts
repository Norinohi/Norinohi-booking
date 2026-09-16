import {
  outboxDrainResultSchema,
  reminderResultSchema,
  retryReleaseInputSchema,
  retryReleaseSchema,
  sweepResultSchema,
  unreleasedOptionsSchema,
  waitingOptionsInputSchema,
  waitingOptionsSchema,
} from "../../contracts/maintenance";
import { emptyInputSchema } from "../../contracts/primitives";
import { adminProcedure } from "../../index";
import { sweepExpiries } from "../../services/expiry";
import { runMaintenance } from "../../services/maintenance";
import { drainOutbox } from "../../services/outbox";
import { sendBalanceReminders } from "../../services/payment-reminders";
import {
  getWaitingOptions,
  listUnreleasedOptions,
  retryReleaseForBooking,
} from "../../services/provider-option";
import { providerForBooking } from "../../services/provider-routing";
import { withJsonBodyExample } from "../openapi-examples";

export const maintenanceAdminRouter = {
  sweepExpiries: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/sweepExpiries",
      operationId: "sweepExpiries",
      summary: "Expire stale quotes and provider holds",
      description:
        "Runs the expiry sweep by hand. Normally this is driven by the scheduled POST /api/cron/sweep-expiries; this exists so staff can clear a stuck slot without waiting for the next run. It also fails sync runs whose process stopped sending a heartbeat, so a provider left holding the in-flight lock does not read as syncing; a scheduled sync no longer waits for this, because opening a run reaps a stale lock itself. Idempotent — running it twice changes nothing the second time.",
      tags: ["Admin"],
      successDescription: "What the sweep changed.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(sweepResultSchema)
    .handler(({ context }) =>
      runMaintenance(context.db, context.session.user.id, "sweep_expiries", () =>
        sweepExpiries(context.db, context.provider),
      ),
    ),
  unreleasedOptions: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/unreleasedOptions",
      operationId: "listUnreleasedOptions",
      summary: "Slots a vendor refused to take back",
      description:
        "Every booking whose last word from the vendor was a refusal to release the option. The slot is still blocked upstream while our own row calls the booking over, so the week sells to nobody until someone frees it. Retryable failures are already queued on the outbox and clear themselves; what lands here usually needs a phone call. Read-only.",
      tags: ["Admin"],
      successDescription: "The options still held against us.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(unreleasedOptionsSchema)
    .handler(async ({ context }) => ({
      items: await listUnreleasedOptions(context.db),
    })),
  retryRelease: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/retryRelease",
      operationId: "retryOptionRelease",
      summary: "Ask the vendor again to take a slot back",
      description:
        "Re-runs the release for one booking the vendor refused to free. Answers with what the vendor said this time rather than throwing: a second refusal is an outcome the operator has to read, not a failure of this call. The booking is already cancelled either way -- this only decides whether the week goes back on sale upstream. Where the vendor's own hold has already lapsed there is nothing left to give back and it answers released.",
      tags: ["Admin"],
      successDescription: "What the vendor said.",
      spec: withJsonBodyExample({ bookingId: "bkg_example" }),
    })
    .input(retryReleaseInputSchema)
    .output(retryReleaseSchema)
    .handler(async ({ context, input }) => {
      const provider = await providerForBooking(context.db, context.provider, input.bookingId);
      const release = await retryReleaseForBooking(context.db, provider, input.bookingId);
      return { released: release.released, reason: release.reason };
    }),
  waitingOptions: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/waitingOptions",
      operationId: "getWaitingOptions",
      summary: "How many people the operator has queued for a sold-out week",
      description:
        "Asks the vendor how many waiting options it already holds for one listing and period, and where each sits in the line. Read-only, and support-facing: nothing on the site offers to join a queue, because filing one is a booking made on a customer's behalf and that decision has not been taken. `supported: false` means this vendor publishes no queue, which is not the same as an empty one.",
      tags: ["Admin"],
      successDescription: "The operator's queue for that boat and week.",
      spec: withJsonBodyExample({
        listingId: "ylst_example",
        from: "2026-07-04",
        to: "2026-07-11",
      }),
    })
    .input(waitingOptionsInputSchema)
    .output(waitingOptionsSchema)
    .handler(({ context, input }) => getWaitingOptions(context.db, context.provider, input)),
  sendPaymentReminders: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/sendPaymentReminders",
      operationId: "sendPaymentReminders",
      summary: "Remind customers of a balance falling due",
      description:
        "Mails every confirmed booking whose balance installment falls due within the next ten days. Normally driven by the scheduled POST /api/cron/payment-reminders; this exists so staff can send the batch after a mailer outage without waiting a day. Each installment is claimed before it is mailed, so running this twice sends nothing the second time.",
      tags: ["Admin"],
      successDescription: "How many reminders went out.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(reminderResultSchema)
    .handler(({ context }) =>
      runMaintenance(context.db, context.session.user.id, "payment_reminders", () =>
        sendBalanceReminders(context.db),
      ),
    ),
  drainOutbox: adminProcedure
    .route({
      method: "POST",
      path: "/admin/maintenance/drainOutbox",
      operationId: "drainOutbox",
      summary: "Send the mail checkout queued but never delivered",
      description:
        "Works through the outbox by hand: the set-password invitations and booking confirmations that guest checkout writes down instead of sending, so the customer is not kept waiting on Resend. Checkout drains this in-process the moment it has answered and POST /api/cron/drain-outbox retries what it missed, so a healthy system leaves nothing here; this exists to push the backlog out after a mailer outage rather than waiting on the backoff. Each message is claimed before it is sent, so running this twice sends nothing the second time.",
      tags: ["Admin"],
      successDescription: "What the drain sent, is retrying, and gave up on.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(outboxDrainResultSchema)
    .handler(({ context }) =>
      runMaintenance(context.db, context.session.user.id, "drain_outbox", () =>
        drainOutbox(context.db),
      ),
    ),
};
