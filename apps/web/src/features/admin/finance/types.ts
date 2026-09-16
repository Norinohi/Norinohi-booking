import type { AdminClient } from "../shared/types";

/* Commission rates: what we earn through each vendor. Entered by staff, read by nothing yet. */
export type CommissionList = Awaited<ReturnType<AdminClient["commission"]["list"]>>;
export type CommissionRow = CommissionList["items"][number];
export type CommissionStatus = CommissionRow["status"];
