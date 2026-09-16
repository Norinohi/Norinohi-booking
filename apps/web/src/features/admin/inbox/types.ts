import type { AdminClient } from "../shared/types";

export type EnquiryList = Awaited<ReturnType<AdminClient["enquiry"]["list"]>>;
export type EnquiryRow = EnquiryList["items"][number];
export type EnquiryStatus = EnquiryRow["status"];

export type LeadList = Awaited<ReturnType<AdminClient["lead"]["list"]>>;
export type LeadRow = LeadList["items"][number];
export type LeadStatus = LeadRow["status"];
export type LeadKind = LeadRow["kind"];
