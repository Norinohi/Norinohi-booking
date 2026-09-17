import type { AdminClient } from "../shared/types";

/* Audit log view-types, inferred from the oRPC contract. */
export type AuditList = Awaited<ReturnType<AdminClient["audit"]["list"]>>;
export type AuditRow = AuditList["items"][number];
export type AuditAction = AuditRow["action"];
export type AuditListInput = NonNullable<Parameters<AdminClient["audit"]["list"]>[0]>;
/** Where an `error` row came from, as the list filter accepts it. */
export type AuditSource = NonNullable<AuditListInput["source"]>;
