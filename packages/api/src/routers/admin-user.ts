import { userAdminListInputSchema, userAdminListSchema } from "../contracts/user-admin";
import { adminProcedure } from "../index";
import { listUsersForAdmin } from "../services/user-admin";
import { withJsonBodyExample } from "./openapi-examples";

export const userAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/user/list",
      operationId: "listUsersForAdmin",
      summary: "List user accounts with their contact details and booking counts",
      description:
        "Every account on the platform with its email, phone and how many bookings it has made. `query` matches a name, an email or a phone number, the last on its digits alone so spacing and a leading + do not matter. `status` separates ordinary accounts from `guest` ones guest checkout created and nobody has claimed, and from deactivated ones. Booking counts leave out bookings marked as not real business. `sort: mostBookings` puts the best customers first.",
      tags: ["Admin"],
      successDescription: "A page of accounts.",
      spec: withJsonBodyExample({ query: "385 91", hasBookings: true, page: 1, pageSize: 20 }),
    })
    .input(userAdminListInputSchema)
    .output(userAdminListSchema)
    .handler(({ context, input }) => listUsersForAdmin(context.db, input)),
};
