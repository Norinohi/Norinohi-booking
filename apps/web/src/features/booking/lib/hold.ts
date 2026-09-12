import { z } from "zod";

/*
 * The refusal `checkout.createHold` names for itself, parsed rather than read off the error,
 * because an ORPCError's `data` is whatever the server put there — the same reason `pay.ts`
 * parses the refusals `checkout.confirm` names.
 *
 * It is the one refusal here that is not the end of an attempt: the earlier submit under this
 * idempotency key is still with the provider, so what it asks for is the same key again
 * shortly. Every other refusal means reprice, and reporting this as a failed booking would
 * send the customer back to change something that was never wrong.
 */
export const holdFailureSchema = z.object({ code: z.literal("HOLD_IN_PROGRESS") });

/*
 * The refusals `checkout.createHold` names for itself, each of which the flow has a sentence
 * for in the reader's own language.
 *
 * The error also carries that sentence in English, written for `cancel_reason` and for support.
 * Showing it was how a Ukrainian checkout ended on an English toast, so the message is now the
 * fallback for a code this does not know rather than the first choice.
 */
export const holdRefusalSchema = z.object({
  code: z.enum([
    /* The vendor says the charter itself is gone. */
    "SLOT_GONE",
    /* The vendor did not answer; nothing is wrong with the booking. */
    "PROVIDER_TIMEOUT",
    /* The vendor refused for a reason only we can act on. */
    "PROVIDER_REFUSED",
    /* Someone else holds this exact option. */
    "SLOT_TAKEN",
    /* An earlier attempt under this key secured nothing, so the way on is a reprice. */
    "HOLD_NEVER_HELD",
  ]),
});

export type HoldRefusalCode = z.infer<typeof holdRefusalSchema>["code"];
