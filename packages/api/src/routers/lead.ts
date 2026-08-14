import { leadCreatedSchema, leadCreateInputSchema } from "../contracts/lead";
import { publicProcedure } from "../index";
import { createLead } from "../services/lead";
import { withJsonBodyExample } from "./openapi-examples";

export const leadRouter = {
  create: publicProcedure
    .route({
      method: "POST",
      path: "/lead/create",
      operationId: "createLead",
      summary: "Send a pre-booking enquiry",
      description:
        "Records an enquiry from Request Quote on a yacht page, Contact a charter expert in the search filters, or Get Consultation on the trip planner results. Public — none of those entry points require an account, though the enquiry is linked to the user when one is signed in. `context` carries whatever the visitor was looking at (search filters, planner answers, or the dates and guests on the sidebar). Sends the enquirer an acknowledgement and alerts staff, both best-effort; staff work these through admin.lead.list and reply with admin.lead.answer.",
      tags: ["Lead"],
      successDescription: "The recorded enquiry.",
      spec: withJsonBodyExample({
        kind: "quote_request",
        listingId: "ylst_yacht-lagoon-42-aurora",
        name: "John Doe",
        email: "john@example.com",
        phone: "+48536839555",
        message: "Is the boat available the following week as well?",
        context: { checkIn: "2026-08-08", checkOut: "2026-08-15", guests: 8 },
      }),
    })
    .input(leadCreateInputSchema)
    .output(leadCreatedSchema)
    .handler(({ context, input }) =>
      createLead(context.db, context.session?.user.id ?? null, input),
    ),
};
