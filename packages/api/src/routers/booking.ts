import { randomUUID } from "node:crypto";

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
  checkoutHoldSchema,
  checkoutStatusInputSchema,
  checkoutStatusSchema,
  enquiryInputSchema,
  enquirySchema,
  invoiceRequestInputSchema,
  invoiceRequestSchema,
  travellerListInputSchema,
  travellerListSchema,
  travellerSaveInputSchema,
} from "../contracts/booking";
import { protectedProcedure } from "../index";
import {
  cancelBooking,
  createHold,
  getBooking,
  getCheckoutStatus,
  listBookings,
} from "../services/booking";
import { askQuestion, getReceipt, requestInvoice } from "../services/checkout";
import { listTravellers, saveTravellers } from "../services/traveller";
import { confirmCheckout } from "../services/payment";
import { withJsonBodyExample } from "./openapi-examples";

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
  get: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/get",
      operationId: "getBooking",
      summary: "Get one booking",
      description:
        "Returns full detail for one of the authenticated user's bookings, including the price breakdown, extras, payment schedule and payments. Crew and passenger details are never returned by this endpoint.",
      tags: ["Booking"],
      successDescription: "The requested booking.",
      spec: withJsonBodyExample({ id: "bkg_example" }),
    })
    .input(bookingIdInputSchema)
    .output(bookingDetailSchema)
    .handler(({ context, input }) => getBooking(context.db, context.session.user.id, input.id)),
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
  receipt: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/receipt",
      operationId: "getBookingReceipt",
      summary: "Get receipt data for a booking",
      description:
        "Returns the figures behind the Download Receipt button: the priced lines with when each is collected, the total, the refundable security deposit, and every payment taken so far. The PDF itself is rendered client-side.",
      tags: ["Booking"],
      successDescription: "Receipt data for the requested booking.",
      spec: withJsonBodyExample({ id: "bkg_example" }),
    })
    .input(bookingIdInputSchema)
    .output(bookingReceiptSchema)
    .handler(({ context, input }) => getReceipt(context.db, context.session.user.id, input.id)),
};

export const checkoutRouter = {
  createHold: protectedProcedure
    .route({
      method: "POST",
      path: "/checkout/createHold",
      operationId: "createCheckoutHold",
      summary: "Turn a quote into a held booking",
      description:
        "Re-validates the quote, creates a booking with the guest details from step 1, records acceptance of the terms and the cancellation policy, and holds a provider option when the active provider supports options. Both consents must be true — an unticked box fails validation here, not just in the browser. Idempotent on idempotencyKey: retrying the same submit returns the original booking instead of holding a second option. An expired quote is rejected with QUOTE_EXPIRED so the caller reprices first.",
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
    .handler(({ context, input }) =>
      createHold(
        context.db,
        context.provider,
        context.session.user.id,
        input.quoteId,
        // A client that does not send one still gets single-call safety; only a
        // retry that reuses the key is deduplicated.
        input.idempotencyKey ?? randomUUID(),
        input.guest,
        input.consents,
      ),
    ),
  status: protectedProcedure
    .route({
      method: "POST",
      path: "/checkout/status",
      operationId: "getCheckoutStatus",
      summary: "Poll a booking's checkout status",
      description:
        "Returns the current state of a booking for the confirmation screen to poll while the provider and payment steps settle, plus a failure reason when it did not go through.",
      tags: ["Checkout"],
      successDescription: "The booking's current checkout state.",
      spec: withJsonBodyExample({ bookingId: "bkg_example" }),
    })
    .input(checkoutStatusInputSchema)
    .output(checkoutStatusSchema)
    .handler(({ context, input }) =>
      getCheckoutStatus(context.db, context.session.user.id, input.bookingId),
    ),
  confirm: protectedProcedure
    .route({
      method: "POST",
      path: "/checkout/confirm",
      operationId: "confirmCheckout",
      summary: "Start a card payment for a booking",
      description:
        "Re-validates the quote, creates the payment schedule and payment rows, and returns a Stripe client secret for the browser to complete with Stripe Elements. paymentPreference chooses between the quote's deposit and paying in full; amounts marked pay-at-check-in are settled with the base and are never charged here. Returns NOT_IMPLEMENTED when STRIPE_SECRET_KEY is unset.",
      tags: ["Checkout"],
      successDescription: "The client secret and the amount being charged.",
      spec: withJsonBodyExample({ bookingId: "bkg_example", paymentPreference: "deposit" }),
    })
    .input(checkoutConfirmInputSchema)
    .output(checkoutConfirmSchema)
    .handler(({ context, input }) =>
      confirmCheckout(
        context.db,
        context.session.user.id,
        input.bookingId,
        input.paymentPreference,
      ),
    ),
  requestInvoice: protectedProcedure
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
        companyName: "Yachts Adventures",
        vatNumber: "GB123123211321312123",
      }),
    })
    .input(invoiceRequestInputSchema)
    .output(invoiceRequestSchema)
    .handler(({ context, input }) => requestInvoice(context.db, context.session.user.id, input)),
  askQuestion: protectedProcedure
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
    .handler(({ context, input }) => askQuestion(context.db, context.session.user.id, input)),
};
