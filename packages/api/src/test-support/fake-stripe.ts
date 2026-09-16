import { WEBHOOK_SECRET } from "./checkout-env";
import { vi } from "vitest";
import type Stripe from "stripe";

import type { Database } from "../context";
import type { InventoryProvider } from "@yacht-charter/providers";
import { stripeClient } from "../services/payment";
import { handleStripeWebhook } from "../services/stripe-webhook";

/*
 * Stripe as the checkout suites see it: the real SDK client `stripeClient()` builds, with the
 * four PaymentIntent calls the booking chain makes answered from memory instead of the network.
 *
 * Intents are kept as Stripe keeps them, so a retry that retrieves one reads the status the last
 * event left behind. Every object handed back is parsed through `webhooks.constructEvent`, the
 * same boundary the webhook route uses, so nothing here claims a type it was not parsed into.
 */
export type FakeStripe = ReturnType<typeof installFakeStripe>;

let sequence = 0;

export function installFakeStripe() {
  const client = stripeClient();
  if (!client) throw new Error("checkout-env did not configure STRIPE_SECRET_KEY");

  const intents = new Map<string, Stripe.PaymentIntent>();

  const store = (intent: Stripe.PaymentIntent) => {
    intents.set(intent.id, intent);
    return withResponse(intent);
  };

  const find = (id: string) => {
    const intent = intents.get(id);
    if (!intent) throw new Error(`fake Stripe has no intent ${id}`);
    return intent;
  };

  /* Moves an intent to `status`, as Stripe does before it sends the event that says so. */
  const settle = (id: string, status: Stripe.PaymentIntent.Status) => {
    const next = parseIntent(client, { ...find(id), status });
    intents.set(id, next);
    return next;
  };

  const create = vi
    .spyOn(client.paymentIntents, "create")
    .mockImplementation(async (params: Stripe.PaymentIntentCreateParams) => {
      sequence += 1;
      const id = `pi_suite_${sequence}`;
      return store(
        parseIntent(client, {
          id,
          object: "payment_intent",
          amount: params.amount,
          currency: params.currency,
          capture_method: params.capture_method ?? "automatic",
          client_secret: `${id}_secret_suite`,
          status: "requires_payment_method",
          cancellation_reason: null,
          last_payment_error: null,
        }),
      );
    });

  const retrieve = vi
    .spyOn(client.paymentIntents, "retrieve")
    .mockImplementation(async (id: string) => withResponse(find(id)));

  const capture = vi
    .spyOn(client.paymentIntents, "capture")
    .mockImplementation(async (id: string) => withResponse(settle(id, "succeeded")));

  const cancel = vi
    .spyOn(client.paymentIntents, "cancel")
    .mockImplementation(async (id: string) => withResponse(settle(id, "canceled")));

  return { client, intents, create, retrieve, capture, cancel, settle };
}

/** A Stripe event as the raw body the webhook route receives. A fresh event id unless given. */
export function eventBody(
  type: Stripe.Event.Type,
  object: Stripe.PaymentIntent,
  id = nextEventId(),
): string {
  return JSON.stringify({
    id,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
}

/**
 * Signs `body` and hands it to the webhook handler, exactly as `apps/server` does with the raw
 * request body and the `stripe-signature` header. Delivering the same body twice is Stripe's retry.
 */
export function deliver(
  db: Database,
  provider: InventoryProvider,
  stripe: FakeStripe,
  body: string,
) {
  const signature = stripe.client.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });

  return handleStripeWebhook(db, provider, body, signature);
}

function nextEventId() {
  sequence += 1;
  return `evt_suite_${sequence}`;
}

function parseIntent(client: Stripe, fields: Partial<Stripe.PaymentIntent>): Stripe.PaymentIntent {
  const payload = JSON.stringify({
    id: "evt_suite_parse",
    object: "event",
    type: "payment_intent.created",
    data: { object: fields },
  });
  const event = client.webhooks.constructEvent(
    payload,
    client.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
    WEBHOOK_SECRET,
  );

  if (event.type !== "payment_intent.created") throw new Error("unreachable event type");
  return event.data.object;
}

function withResponse(intent: Stripe.PaymentIntent): Stripe.Response<Stripe.PaymentIntent> {
  return {
    ...intent,
    lastResponse: { headers: {}, requestId: "req_suite", statusCode: 200 },
  };
}
