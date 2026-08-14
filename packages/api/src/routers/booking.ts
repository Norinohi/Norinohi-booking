import { randomUUID } from "node:crypto";

import type { z } from "zod";

import {
  bookingCancelInputSchema,
  bookingCancelSchema,
  bookingDetailSchema,
  bookingIdInputSchema,
  bookingListInputSchema,
  bookingListSchema,
  bookingReceiptSchema,
  checkoutConfirmInputSchema,
  checkoutConfirmSchema,
  checkoutCreateHoldInputSchema,
  checkoutPayBalanceInputSchema,
  checkoutHoldSchema,
  checkoutStatusInputSchema,
  checkoutStatusSchema,
  enquiryInputSchema,
  enquirySchema,
  guestDetailsSchema,
  invoiceDocumentSchema,
  invoiceRequestInputSchema,
  invoiceRequestSchema,
  travellerListInputSchema,
  travellerListSchema,
  travellerSaveInputSchema,
} from "../contracts/booking";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure } from "../index";
import {
  cancelBooking,
  type CheckoutActor,
  createHold,
  getBooking,
  getCheckoutStatus,
  listBookings,
} from "../services/booking";
import { provisionGuestAccount } from "../services/account-provisioning";
import { askQuestion, getReceipt, requestInvoice } from "../services/checkout";
import { mintGuestAccessToken, resolveBookingActor } from "../services/guest-access";
import { getInvoiceDocument } from "../services/invoice-document";
import { listTravellers, saveTravellers } from "../services/traveller";
import { confirmCheckout, payBalance } from "../services/payment";
import { withJsonBodyExample } from "./openapi-examples";

/**
 * Who the booking about to be created belongs to.
 *
 * A signed-in customer books as themselves and the guest block is only the party
 * travelling. Without a session the email on that block decides the account: an
 * existing one is reused rather than duplicated, since the address is the identity
 * better-auth keys on. Reuse hands out no session and no account-wide access — only
 * a token scoped to the booking this call is creating.
 */
async function checkoutActor(
  context: Pick<Context, "db" | "session">,
  guest: z.infer<typeof guestDetailsSchema>,
): Promise<CheckoutActor> {
  const sessionUserId = context.session?.user.id;
  if (sessionUserId) return { userId: sessionUserId, guestAccess: null };

  const account = await provisionGuestAccount(context.db, {
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
  });

  return { userId: account.userId, guestAccess: mintGuestAccessToken() };
}

/**
 * Who is acting on an existing booking.
 *
 * Everything a customer does to one is reachable two ways: signed in, or holding the
 * token guest checkout handed back. Both collapse to the owning user id here, so the
 * services keep their single notion of a caller and enforce ownership exactly as
 * before, which is what lets those procedures be `publicProcedure` without being
 * public. `booking.list` and `booking.cancel` deliberately stay session-only: one is
 * an account-wide read and the other is irreversible, and a token that authorises one
 * booking is evidence of neither.
 */
function actorFor(
  context: Pick<Context, "db" | "session">,
  bookingId: string,
  accessToken: string | undefined,
): Promise<string> {
  return resolveBookingActor(context.db, context.session?.user.id, bookingId, accessToken);
}

export const bookingRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/list",
      operationId: "listBookings",
      summary: "List the current user's bookings",
      description:
        "Returns the authenticated user's booking history, newest first, with numbered pagination. The optional from/to window filters on the charter period rather than when the booking was made. Cards render from each booking's frozen commercial snapshot, so they stay correct after a listing changes or is withdrawn.",
      tags: ["Booking"],
      successDescription: "A page of bookings.",
      spec: withJsonBodyExample({ page: 1, pageSize: 10 }),
    })
    .input(bookingListInputSchema)
    .output(bookingListSchema)
    .handler(({ context, input }) => listBookings(context.db, context.session.user.id, input)),
  get: publicProcedure
    .route({
      method: "POST",
      path: "/booking/get",
      operationId: "getBooking",
      summary: "Get one booking",
      description:
        "Returns full detail for one booking, including the price breakdown, extras, payment schedule and payments. Reachable by the signed-in owner, or by a guest presenting the accessToken their checkout returned. Crew and passenger details are never returned by this endpoint.",
      tags: ["Booking"],
      successDescription: "The requested booking.",
      spec: withJsonBodyExample({ id: "bkg_example" }),
    })
    .input(bookingIdInputSchema)
    .output(bookingDetailSchema)
    .handler(async ({ context, input }) =>
      getBooking(context.db, await actorFor(context, input.id, input.accessToken), input.id),
    ),
  cancel: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/cancel",
      operationId: "cancelBooking",
      summary: "Cancel a booking",
      description:
        "Cancels one of the authenticated user's bookings. Only bookings that have not been confirmed can be cancelled this way; a confirmed booking has to go through admin.booking.cancel so it enters the refund flow.",
      tags: ["Booking"],
      successDescription: "The booking's status after cancellation.",
      spec: withJsonBodyExample({ id: "bkg_example", reason: "Changed plans" }),
    })
    .input(bookingCancelInputSchema)
    .output(bookingCancelSchema)
    .handler(({ context, input }) =>
      cancelBooking(context.db, context.provider, input.id, input.reason, {
        userId: context.session.user.id,
        isAdmin: false,
      }),
    ),
  travellers: {
    list: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/travellers/list",
        operationId: "listBookingTravellers",
        summary: "List the crew and passengers on a booking",
        description:
          "Returns the traveller details recorded for one of the authenticated user's bookings. This is the only endpoint that returns them: booking.get and booking.receipt deliberately omit crew and passport data, and the identity-document fields are encrypted at rest. Returns NOT_IMPLEMENTED when ENCRYPTION_KEY is unset.",
        tags: ["Booking"],
        successDescription: "The travellers recorded for the booking.",
        spec: withJsonBodyExample({ bookingId: "bkg_example" }),
      })
      .input(travellerListInputSchema)
      .output(travellerListSchema)
      .handler(({ context, input }) =>
        listTravellers(context.db, context.session.user.id, input.bookingId),
      ),
    save: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/travellers/save",
        operationId: "saveBookingTravellers",
        summary: "Replace the crew list on a booking",
        description:
          "Stores the whole crew list for one of the authenticated user's bookings, replacing whatever was there. Submitting the same form twice leaves one list rather than two, and an empty array clears it. Date of birth and document number are encrypted before they are written. Refused once a booking is cancelled, refunded, rejected or expired, when the details would serve no purpose.",
        tags: ["Booking"],
        successDescription: "The stored crew list.",
        spec: withJsonBodyExample({
          bookingId: "bkg_example",
          travellers: [
            {
              fullName: "John Doe",
              role: "skipper",
              dateOfBirth: "1986-04-12",
              documentNumber: "X1234567",
              nationality: "GB",
            },
          ],
        }),
      })
      .input(travellerSaveInputSchema)
      .output(travellerListSchema)
      .handler(({ context, input }) => saveTravellers(context.db, context.session.user.id, input)),
  },
  receipt: publicProcedure
    .route({
      method: "POST",
      path: "/booking/receipt",
      operationId: "getBookingReceipt",
      summary: "Get receipt data for a booking",
      description:
        "Returns the figures behind the Download Receipt button: the priced lines with when each is collected, the total, the refundable security deposit, and every payment taken so far. Reachable by the signed-in owner or with a guest accessToken. The PDF itself is rendered client-side.",
      tags: ["Booking"],
      successDescription: "Receipt data for the requested booking.",
      spec: withJsonBodyExample({ id: "bkg_example" }),
    })
    .input(bookingIdInputSchema)
    .output(bookingReceiptSchema)
    .handler(async ({ context, input }) =>
      getReceipt(context.db, await actorFor(context, input.id, input.accessToken), input.id),
    ),
  invoice: publicProcedure
    .route({
      method: "POST",
      path: "/booking/invoice",
      operationId: "getBookingInvoice",
      summary: "Get the invoice document for a booking",
      description:
        "Returns everything the printable invoice renders: the issued number and due date, the seller's legal and tax details, the billed party exactly as it was captured at checkout, the priced lines, what is due now, and the bank details to transfer to. Reachable by the signed-in owner or with a guest accessToken — a guest who chose bank transfer needs this document as much as an account holder does. Null when the booking was paid by card and no invoice was ever requested.",
      tags: ["Booking"],
      successDescription: "The invoice document, or null when the booking has no invoice.",
      spec: withJsonBodyExample({ id: "bkg_example" }),
    })
    .input(bookingIdInputSchema)
    .output(invoiceDocumentSchema)
    .handler(async ({ context, input }) =>
      getInvoiceDocument(
        context.db,
        await actorFor(context, input.id, input.accessToken),
        input.id,
      ),
    ),
};

export const checkoutRouter = {
  createHold: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/createHold",
      operationId: "createCheckoutHold",
      summary: "Turn a quote into a held booking",
      description:
        "Re-validates the quote, creates a booking with the guest details from step 1, records acceptance of the terms and the cancellation policy, and holds a provider option when the active provider supports options. Sign-in is not required: a booking made without a session provisions an account from the guest email and returns an accessToken, which is how that customer reaches the rest of their own checkout until they set a password. Both consents must be true — an unticked box fails validation here, not just in the browser. Idempotent on idempotencyKey: retrying the same submit returns the original booking instead of holding a second option. An expired quote is rejected with QUOTE_EXPIRED so the caller reprices first.",
      tags: ["Checkout"],
      successDescription: "The booking created for this quote, with its hold expiry.",
      spec: withJsonBodyExample({
        quoteId: "qte_example",
        guest: {
          fullName: "John Doe",
          email: "john@example.com",
          phone: "+48536839555",
          specialRequests: "Early check in please",
        },
        consents: { terms: true, cancellationPolicy: true },
        idempotencyKey: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      }),
    })
    .input(checkoutCreateHoldInputSchema)
    .output(checkoutHoldSchema)
    .handler(async ({ context, input }) =>
      createHold(
        context.db,
        context.provider,
        await checkoutActor(context, input.guest),
        input.quoteId,
        // A client that does not send one still gets single-call safety; only a
        // retry that reuses the key is deduplicated.
        input.idempotencyKey ?? randomUUID(),
        input.guest,
        input.consents,
      ),
    ),
  status: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/status",
      operationId: "getCheckoutStatus",
      summary: "Poll a booking's checkout status",
      description:
        "Returns the current state of a booking for the confirmation screen to poll while the provider and payment steps settle, plus a failure reason when it did not go through. Reachable by the signed-in owner or with a guest accessToken.",
      tags: ["Checkout"],
      successDescription: "The booking's current checkout state.",
      spec: withJsonBodyExample({ bookingId: "bkg_example" }),
    })
    .input(checkoutStatusInputSchema)
    .output(checkoutStatusSchema)
    .handler(async ({ context, input }) =>
      getCheckoutStatus(
        context.db,
        await actorFor(context, input.bookingId, input.accessToken),
        input.bookingId,
      ),
    ),
  confirm: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/confirm",
      operationId: "confirmCheckout",
      summary: "Start a card payment for a booking",
      description:
        "Re-validates the quote, creates the payment schedule and payment rows, and returns a Stripe client secret for the browser to complete with Stripe Elements. Reachable by the signed-in owner or with a guest accessToken. paymentPreference chooses between the quote's deposit and paying in full; amounts marked pay-at-check-in are settled with the base and are never charged here. Returns NOT_IMPLEMENTED when STRIPE_SECRET_KEY is unset.",
      tags: ["Checkout"],
      successDescription: "The client secret and the amount being charged.",
      spec: withJsonBodyExample({ bookingId: "bkg_example", paymentPreference: "deposit" }),
    })
    .input(checkoutConfirmInputSchema)
    .output(checkoutConfirmSchema)
    .handler(async ({ context, input }) =>
      confirmCheckout(
        context.db,
        await actorFor(context, input.bookingId, input.accessToken),
        input.bookingId,
        input.paymentPreference,
      ),
    ),
  payBalance: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/payBalance",
      operationId: "payCheckoutBalance",
      summary: "Pay the remainder on a confirmed booking",
      description:
        "Opens a Stripe payment for whatever a confirmed booking still owes: the collectable total less everything already paid. This is how a deposit booking settles its second installment, so the balance does not have to be chased outside the system. The booking stays CONFIRMED throughout — the charter exists whether or not this payment has landed — and only a CONFIRMED booking is accepted; anything else answers NOT_PAYABLE. A booking with nothing left to pay answers ALREADY_PAID. Amounts marked pay-at-check-in are settled with the base and are never charged here. Reachable by the signed-in owner or with a guest accessToken.",
      tags: ["Checkout"],
      successDescription: "The client secret and the outstanding amount being charged.",
      spec: withJsonBodyExample({ bookingId: "bkg_example" }),
    })
    .input(checkoutPayBalanceInputSchema)
    .output(checkoutConfirmSchema)
    .handler(async ({ context, input }) =>
      payBalance(
        context.db,
        await actorFor(context, input.bookingId, input.accessToken),
        input.bookingId,
      ),
    ),
  requestInvoice: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/requestInvoice",
      operationId: "requestCheckoutInvoice",
      summary: "Ask for an invoice instead of paying by card",
      description:
        "Records that the customer will pay by bank transfer and moves the booking to PAYMENT_PENDING with an unpaid invoice payment. Re-submitting returns the existing request rather than creating a second one. No email is sent — the record is what staff act on until email infrastructure exists.",
      tags: ["Checkout"],
      successDescription: "The invoice request and the booking's new status.",
      spec: withJsonBodyExample({
        bookingId: "bkg_example",
        billingEmail: "billing@example.com",
        billingName: "Jane Doe",
        addressLine1: "12 Harbour Road",
        city: "Split",
        postalCode: "21000",
        countryCode: "HR",
        companyName: "Yachts Adventures",
        vatNumber: "GB123123211321312123",
      }),
    })
    .input(invoiceRequestInputSchema)
    .output(invoiceRequestSchema)
    .handler(async ({ context, input }) =>
      requestInvoice(
        context.db,
        await actorFor(context, input.bookingId, input.accessToken),
        input,
      ),
    ),
  askQuestion: publicProcedure
    .route({
      method: "POST",
      path: "/checkout/askQuestion",
      operationId: "askCheckoutQuestion",
      summary: "Send a question before paying",
      description:
        "Records a pre-payment question such as a licence check or a special requirement. The booking deliberately keeps its current status — asking is not a commitment to pay — so the provider hold continues to run down as normal.",
      tags: ["Checkout"],
      successDescription: "The recorded question and the booking's unchanged status.",
      spec: withJsonBodyExample({
        bookingId: "bkg_example",
        question: "Do you need to see a sailing licence before departure?",
      }),
    })
    .input(enquiryInputSchema)
    .output(enquirySchema)
    .handler(async ({ context, input }) =>
      askQuestion(context.db, await actorFor(context, input.bookingId, input.accessToken), input),
    ),
};
