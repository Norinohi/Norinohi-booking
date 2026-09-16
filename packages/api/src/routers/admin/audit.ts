import { auditListInputSchema, auditListSchema } from "../../contracts/admin";
import { adminProcedure } from "../../index";
import { listAuditLog } from "../../services/audit";
import { withJsonBodyExample } from "../openapi-examples";

export const auditAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/audit/list",
      operationId: "listAuditLog",
      summary: "Read the admin audit log",
      description:
        "Returns audit entries newest first with the actor's name and email, filterable by entityType, entityId and action. Every admin mutation writes one; this is the only way to see them after the fact, including which listings a merge combined.",
      tags: ["Admin"],
      successDescription: "A page of audit entries.",
      spec: withJsonBodyExample({
        entityType: "listing",
        action: "merge",
        page: 1,
        pageSize: 20,
      }),
    })
    .input(auditListInputSchema)
    .output(auditListSchema)
    .handler(({ context, input }) => listAuditLog(context.db, input)),
};
