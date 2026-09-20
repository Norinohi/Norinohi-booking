import type { AdminClient } from "../shared/types";

/* Commission rates: what we earn through each vendor. Entered by staff, read by nothing yet. */
export type CommissionList = Awaited<ReturnType<AdminClient["commission"]["list"]>>;
export type CommissionRow = CommissionList["items"][number];
export type CommissionStatus = CommissionRow["status"];

/* What the vendors themselves report, per operator, from the rate the sweep last saw. */
export type ReportedCommissionList = Awaited<ReturnType<AdminClient["commission"]["reported"]>>;
export type ReportedCommissionRow = ReportedCommissionList["items"][number];
