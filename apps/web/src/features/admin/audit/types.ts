import type { AdminClient } from "../shared/types";

/* Audit log view-types, inferred from the oRPC contract. */
export type AuditList = Awaited<ReturnType<AdminClient["audit"]["list"]>>;
export type AuditRow = AuditList["items"][number];
export type AuditAction = AuditRow["action"];
