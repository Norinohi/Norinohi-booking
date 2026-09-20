import type { AdminClient } from "../shared/types";

export type InvoiceList = Awaited<ReturnType<AdminClient["invoice"]["list"]>>;
export type InvoiceRow = InvoiceList["items"][number];
export type InvoiceStatus = InvoiceRow["status"];

export type PaymentAdminList = Awaited<ReturnType<AdminClient["payment"]["list"]>>;
export type PaymentAdminRow = PaymentAdminList["items"][number];
export type PaymentStatus = PaymentAdminRow["status"];
export type PaymentKind = PaymentAdminRow["kind"];
export type PaymentMethod = PaymentAdminRow["method"];

export type BookingAdminDetail = Awaited<ReturnType<AdminClient["booking"]["get"]>>;
export type BookingAdminPayment = BookingAdminDetail["payments"][number];
export type BookingAdminList = Awaited<ReturnType<AdminClient["booking"]["list"]>>;
export type BookingAdminRow = BookingAdminList["items"][number];
export type BookingStatus = BookingAdminRow["status"];
/** What admin.booking.refund reports back — some of it needs a human, so it is shown. */
export type RefundResult = Awaited<ReturnType<AdminClient["booking"]["refund"]>>;
