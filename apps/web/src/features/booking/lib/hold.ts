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
