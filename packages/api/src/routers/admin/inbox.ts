import {
  enquiryAnswerInputSchema,
  enquiryListInputSchema,
  enquiryListSchema,
  enquiryRowSchema,
  enquirySetStatusInputSchema,
} from "../../contracts/enquiry";
import {
  leadAnswerInputSchema,
  leadListInputSchema,
  leadListSchema,
  leadSchema,
  leadSetStatusInputSchema,
} from "../../contracts/lead";
import { adminProcedure } from "../../index";
import { answerEnquiry, listEnquiries, setEnquiryStatus } from "../../services/enquiry";
import { answerLead, listLeads, setLeadStatus } from "../../services/lead";
import { withJsonBodyExample } from "../openapi-examples";

export const leadAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/lead/list",
      operationId: "listLeads",
      summary: "List pre-booking enquiries",
      description:
        "Returns enquiries from Request Quote, Contact a charter expert, and Get Consultation, newest first, filterable by kind and status. Reply to one with admin.lead.answer. Distinct from admin.enquiry.list, which is questions about existing bookings.",
      tags: ["Admin"],
      successDescription: "A page of enquiries.",
      spec: withJsonBodyExample({ status: "new", page: 1, pageSize: 20 }),
    })
    .input(leadListInputSchema)
    .output(leadListSchema)
    .handler(({ context, input }) => listLeads(context.db, input)),
  setStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/lead/setStatus",
      operationId: "setLeadStatus",
      summary: "Move an enquiry through the pipeline",
      description:
        "Marks an enquiry as contacted or closed and records who handled it. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The enquiry with its new status.",
      spec: withJsonBodyExample({ id: "lead_example", status: "contacted" }),
    })
    .input(leadSetStatusInputSchema)
    .output(leadSchema)
    .handler(({ context, input }) =>
      setLeadStatus(context.db, context.session.user.id, input.id, input.status),
    ),
  answer: adminProcedure
    .route({
      method: "POST",
      path: "/admin/lead/answer",
      operationId: "answerLead",
      summary: "Reply to a pre-booking enquiry",
      description:
        "Records the reply and emails it to the enquirer with their message quoted back and a link to the yacht they asked about. Closes the enquiry unless `close` is false, which leaves it at contacted for a follow-up. Writes an audit log entry. A failed send does not lose the recorded answer.",
      tags: ["Admin"],
      successDescription: "The answered enquiry.",
      spec: withJsonBodyExample({
        id: "lead_example",
        answer: "That week is still open at the price shown. Shall I hold it for you until Friday?",
      }),
    })
    .input(leadAnswerInputSchema)
    .output(leadSchema)
    .handler(({ context, input }) => answerLead(context.db, context.session.user.id, input)),
};

export const enquiryAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/enquiry/list",
      operationId: "listBookingEnquiries",
      summary: "List questions asked about bookings",
      description:
        "Questions customers asked from the checkout's Ask a question step or from /support, newest first, filterable by status and searchable by customer email or booking reference. Each row carries the booking it is about. Distinct from admin.lead.list, which is the pre-booking funnel.",
      tags: ["Admin"],
      successDescription: "A page of booking enquiries.",
      spec: withJsonBodyExample({ status: "open", page: 1, pageSize: 20 }),
    })
    .input(enquiryListInputSchema)
    .output(enquiryListSchema)
    .handler(({ context, input }) => listEnquiries(context.db, input)),
  answer: adminProcedure
    .route({
      method: "POST",
      path: "/admin/enquiry/answer",
      operationId: "answerBookingEnquiry",
      summary: "Reply to a booking question",
      description:
        "Records the reply and emails it to the customer with their question quoted back and a link to the booking. Closes the enquiry unless `close` is false, which leaves it open for a follow-up. Writes an audit log entry. A failed send does not lose the recorded answer.",
      tags: ["Admin"],
      successDescription: "The answered enquiry.",
      spec: withJsonBodyExample({
        id: "enq_example",
        answer: "Yes — please bring the skipper's licence and one ID per guest.",
      }),
    })
    .input(enquiryAnswerInputSchema)
    .output(enquiryRowSchema)
    .handler(({ context, input }) => answerEnquiry(context.db, context.session.user.id, input)),
  setStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/enquiry/setStatus",
      operationId: "setBookingEnquiryStatus",
      summary: "Reopen or close a booking question",
      description:
        "Moves an enquiry without replying — closing one handled by phone, or reopening one that was closed too early. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The enquiry with its new status.",
      spec: withJsonBodyExample({ id: "enq_example", status: "closed" }),
    })
    .input(enquirySetStatusInputSchema)
    .output(enquiryRowSchema)
    .handler(({ context, input }) => setEnquiryStatus(context.db, context.session.user.id, input)),
};
