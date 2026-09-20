import {
  adminBookingGetInputSchema,
  bookingAdminDetailSchema,
  bookingAdminListInputSchema,
  bookingAdminListSchema,
  bookingCancelInputSchema,
  bookingCancelSchema,
  bookingExcludeByCompanyInputSchema,
  bookingExcludeByCompanySchema,
  bookingExcludeInputSchema,
  bookingExcludeSchema,
  bookingRefundInputSchema,
  bookingRefundSchema,
  invoiceAdminRowSchema,
  invoiceCancelInputSchema,
  invoiceListInputSchema,
  invoiceListSchema,
  invoiceSettleInputSchema,
  invoiceSettleSchema,
  paymentAdminListInputSchema,
  paymentAdminListSchema,
} from "../../contracts/booking";
import { adminProcedure } from "../../index";
import { cancelBooking } from "../../services/booking";
import {
  excludeBookingsByCompany,
  getBookingForAdmin,
  listBookingsForAdmin,
  setBookingExcluded,
} from "../../services/booking-admin";
import {
  cancelInvoiceRequest,
  listInvoiceRequests,
  settleInvoiceRequest,
} from "../../services/invoice";
import { listPaymentsForAdmin } from "../../services/payment-admin";
import { providerForBooking } from "../../services/provider-routing";
import { refundBooking } from "../../services/refund";
import { withJsonBodyExample } from "../openapi-examples";

export const bookingAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/list",
      operationId: "listBookingsForAdmin",
      summary: "List bookings across every customer",
      description:
        'The staff view of the booking table, filterable by status and searchable by reference, customer name or email. Carries the customer and the money actually collected rather than the listing card the customer\'s own history shows. Passing status: ["REFUND_PENDING"] is the refund queue — bookings whose money is owed back and which nothing else surfaces.',
      tags: ["Admin"],
      successDescription: "A page of bookings.",
      spec: withJsonBodyExample({ status: ["REFUND_PENDING"], page: 1, pageSize: 20 }),
    })
    .input(bookingAdminListInputSchema)
    .output(bookingAdminListSchema)
    .handler(({ context, input }) => listBookingsForAdmin(context.db, input)),
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/get",
      operationId: "getBookingForAdmin",
      summary: "Read any booking, regardless of owner",
      description:
        "The staff view of one booking: the customer it belongs to, the provider reservation, every price line, the payment schedule, and each payment with how it arrived and whether it is disputed. booking.get is scoped to the session user and answers NOT_FOUND for anyone else — correct for a customer, which is why staff need this. Travellers are deliberately absent here too: passport and crew data stays behind booking.travellers.*.",
      tags: ["Admin"],
      successDescription: "The booking.",
      spec: withJsonBodyExample({ id: "bkg_example", locale: "uk" }),
    })
    .input(adminBookingGetInputSchema)
    .output(bookingAdminDetailSchema)
    .handler(({ context, input }) => getBookingForAdmin(context.db, input.id, input.locale)),
  setExcluded: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/set-excluded",
      operationId: "setBookingExcluded",
      summary: "Mark a booking as not real business, or put it back",
      description:
        "Marks a booking as test data, so the staff queues and the money totals stop counting it. Nothing about the booking moves: the status, the payments and the provider reservation are untouched, and the customer still sees it in their own history. This is for a reservation that was never real — typically one made against a vendor's test charter company to prove the flow works. A booking that was real and is not happening should be cancelled instead. Reversible: pass excluded: false. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The booking's exclusion after the change.",
      spec: withJsonBodyExample({
        id: "bkg_example",
        excluded: true,
        reason: "Test booking against the vendor's test company",
      }),
    })
    .input(bookingExcludeInputSchema)
    .output(bookingExcludeSchema)
    .handler(({ context, input }) =>
      setBookingExcluded(context.db, input, context.session.user.id),
    ),
  excludeByCompany: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/exclude-by-company",
      operationId: "excludeBookingsByCompany",
      summary: "Mark every booking against one charter company as not real business",
      description:
        "The bulk form of booking.setExcluded, scoped to one provider's charter company id. Written for the case it names: a vendor's test charter company is imported, bookings are made against its yachts to prove checkout works, and afterwards there is no way to say none of that was real without clicking through each one. Scoped by the provider's own company id rather than by anything of ours, so it keeps working after the company's listings have been hidden by the import scope. Dry by default — apply: false reports exactly which references would be excluded and changes nothing.",
      tags: ["Admin"],
      successDescription: "What matched, and whether it was applied.",
      spec: withJsonBodyExample({
        provider: "booking_manager",
        externalCompanyId: "225",
        apply: false,
      }),
    })
    .input(bookingExcludeByCompanyInputSchema)
    .output(bookingExcludeByCompanySchema)
    .handler(({ context, input }) =>
      excludeBookingsByCompany(context.db, input, context.session.user.id),
    ),
  cancel: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/cancel",
      operationId: "adminCancelBooking",
      summary: "Cancel any booking",
      description:
        "Cancels a booking on behalf of a customer, including a confirmed one — a confirmed booking moves to REFUND_PENDING so the money is returned rather than being silently dropped. Check `providerReleased` before paying that refund: false means we cancelled our side and the provider kept the reservation, which Booking Manager does for every confirmed one, so the charter still stands with the operator and has to be settled by hand. `providerReleaseError` carries their refusal. Requires an authenticated admin user.",
      tags: ["Admin"],
      successDescription: "The booking's status after cancellation.",
      spec: withJsonBodyExample({ id: "bkg_example", reason: "Operator withdrew the yacht" }),
    })
    .input(bookingCancelInputSchema)
    .output(bookingCancelSchema)
    .handler(async ({ context, input }) =>
      cancelBooking(
        context.db,
        await providerForBooking(context.db, context.provider, input.id),
        input.id,
        input.reason,
        {
          userId: context.session.user.id,
          isAdmin: true,
        },
      ),
    ),
  refund: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/refund",
      operationId: "adminRefundBooking",
      summary: "Return the money on a booking that owes a refund",
      description:
        "Refunds a booking sitting at REFUND_PENDING, then moves it to REFUNDED once nothing is outstanding. Pass amountMinor to return part of the money — what a cancellation policy retains is a decision staff make until one is modelled — or omit it to return everything collected. Card money is allocated first and goes back through Stripe; a bank transfer cannot, so those are reported in requiresManualTransfer and only count as returned when staff resend the money and pass manualTransferSettled. Every refund is recorded before Stripe is called and keyed on that record, so a retry finishes the job rather than paying twice and a partial refund can be topped up later. A provider rejection refunds itself; this is for the admin-cancelled case and for retries. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "What was returned and the booking's resulting status.",
      spec: withJsonBodyExample({ id: "bkg_example", reason: "Operator withdrew the yacht" }),
    })
    .input(bookingRefundInputSchema)
    .output(bookingRefundSchema)
    .handler(({ context, input }) =>
      refundBooking(context.db, input.id, {
        amountMinor: input.amountMinor,
        reason: input.reason,
        manualTransferSettled: input.manualTransferSettled,
        actorUserId: context.session.user.id,
      }),
    ),
};

export const paymentAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/payment/list",
      operationId: "listPaymentsForAdmin",
      summary: "List every payment taken, across every booking",
      description:
        "One row per payment rather than per booking, because a single charter can be a deposit paid by card and a balance paid by transfer months later. Filterable by payment status, installment kind and method, and searchable by booking reference, customer name or email. `totals` sums the whole filter rather than the page, per currency, and counts only succeeded payments as collected - an authorization is a hold on the customer's card, not money we have. The invoice and refund tabs beside this one are queues of work; this one is the record, and it is the only place a card payment that simply worked is visible.",
      tags: ["Admin"],
      successDescription: "A page of payments, with the totals behind the filter.",
      spec: withJsonBodyExample({ status: ["succeeded"], page: 1, pageSize: 20 }),
    })
    .input(paymentAdminListInputSchema)
    .output(paymentAdminListSchema)
    .handler(({ context, input }) => listPaymentsForAdmin(context.db, input)),
};

export const invoiceAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/invoice/list",
      operationId: "listInvoiceRequests",
      summary: "List bank-transfer invoice requests",
      description:
        "Customers who chose Request invoice instead of paying by card. Their bookings sit at PAYMENT_PENDING until someone settles the transfer here — this is the only place those requests are visible.",
      tags: ["Admin"],
      successDescription: "A page of invoice requests.",
      spec: withJsonBodyExample({ status: "pending", page: 1, pageSize: 20 }),
    })
    .input(invoiceListInputSchema)
    .output(invoiceListSchema)
    .handler(({ context, input }) => listInvoiceRequests(context.db, input)),
  settle: adminProcedure
    .route({
      method: "POST",
      path: "/admin/invoice/settle",
      operationId: "settleInvoiceRequest",
      summary: "Record a received bank transfer",
      description:
        "Marks the transfer as received and then commits the booking with the provider through the same path a card payment takes. Idempotent: settling twice does not re-record the payment or re-confirm. A provider refusal is reported in providerRejection rather than thrown — the money did arrive, so the settlement stands and the booking moves to REFUND_PENDING. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The settled invoice and the booking's resulting status.",
      spec: withJsonBodyExample({ id: "inv_example", note: "Transfer received" }),
    })
    .input(invoiceSettleInputSchema)
    .output(invoiceSettleSchema)
    .handler(({ context, input }) =>
      settleInvoiceRequest(context.db, context.provider, context.session.user.id, input),
    ),
  cancel: adminProcedure
    .route({
      method: "POST",
      path: "/admin/invoice/cancel",
      operationId: "cancelInvoiceRequest",
      summary: "Withdraw an unpaid invoice request",
      description:
        "Cancels an invoice that will not be paid and cancels the booking waiting on it, so the provider option is not held for nothing. Refuses once the invoice has been settled — cancel the booking instead, which routes it to a refund. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The cancelled invoice request.",
      spec: withJsonBodyExample({ id: "inv_example", reason: "No response from customer" }),
    })
    .input(invoiceCancelInputSchema)
    .output(invoiceAdminRowSchema)
    .handler(({ context, input }) =>
      cancelInvoiceRequest(
        context.db,
        context.provider,
        context.session.user.id,
        input.id,
        input.reason,
      ),
    ),
};
