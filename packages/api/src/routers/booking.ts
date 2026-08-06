import { randomUUID } from "node:crypto";

import { createInventoryProvider } from "@yacht-charter/providers";

import {
  bookingCancelInputSchema,
  bookingCancelSchema,
  bookingDetailSchema,
  bookingIdInputSchema,
  bookingListInputSchema,
  bookingListSchema,
  checkoutCreateHoldInputSchema,
  checkoutHoldSchema,
  checkoutStatusInputSchema,
  checkoutStatusSchema,
} from "../contracts/booking";
import { protectedProcedure } from "../index";
import {
  cancelBooking,
  createHold,
  getBooking,
  getCheckoutStatus,
  listBookings,
} from "../services/booking";
import { withJsonBodyExample } from "./openapi-examples";

const provider = createInventoryProvider();

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
      cancelBooking(context.db, input.id, input.reason, {
        userId: context.session.user.id,
        isAdmin: false,
      }),
    ),
};

export const checkoutRouter = {
  createHold: protectedProcedure
    .route({
      method: "POST",
      path: "/checkout/createHold",
      operationId: "createCheckoutHold",
      summary: "Turn a quote into a held booking",
      description:
        "Re-validates the quote, creates a booking, and holds a provider option when the active provider supports options. Idempotent on idempotencyKey: retrying the same submit returns the original booking instead of holding a second option. An expired quote is rejected with QUOTE_EXPIRED so the caller reprices first.",
      tags: ["Checkout"],
      successDescription: "The booking created for this quote, with its hold expiry.",
      spec: withJsonBodyExample({
        quoteId: "qte_example",
        idempotencyKey: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      }),
    })
    .input(checkoutCreateHoldInputSchema)
    .output(checkoutHoldSchema)
    .handler(({ context, input }) =>
      createHold(
        context.db,
        provider,
        context.session.user.id,
        input.quoteId,
        // A client that does not send one still gets single-call safety; only a
        // retry that reuses the key is deduplicated.
        input.idempotencyKey ?? randomUUID(),
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
};
