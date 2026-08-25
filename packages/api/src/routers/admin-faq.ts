import {
  faqCreateInputSchema,
  faqDeletedSchema,
  faqDeleteInputSchema,
  faqEntryResultSchema,
  faqGroupSchema,
  faqIdInputSchema,
  faqListInputSchema,
  faqListSchema,
  faqReorderedSchema,
  faqReorderInputSchema,
  faqUpdateInputSchema,
} from "../contracts/faq";
import { adminProcedure } from "../index";
import {
  createFaqEntry,
  deleteFaqEntry,
  getFaqGroup,
  listFaq,
  reorderFaq,
  updateFaqEntry,
} from "../services/faq-admin";
import { withJsonBodyExample } from "./openapi-examples";

/*
 * The authoring side of the FAQ. The read side is the listing detail page, which matches the
 * requested locale exactly and drops any entry whose answer is blank — so the two things this
 * screen has to make visible are a question that exists in three languages instead of four, and
 * a question that is on the site's list but answers nobody.
 *
 * Every procedure here speaks in *groups*: one question with its translations. The database
 * stores a row per locale, and `delete` is the only place a single row is addressed on its own.
 * Every mutation goes through `audit_log`, one entry per row it touched.
 */
export const faqAdminRouter = {
  list: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/list",
      operationId: "listFaqEntries",
      summary: "List FAQ entries grouped by question",
      description:
        "The FAQ as one row per question rather than one per locale, with the locales it is missing and the locales whose answer is still blank. `scope` chooses the site-wide list or one listing's own. `locale` narrows the gap checks and the search to a single language, and on its own filters nothing — a question absent from German is exactly what an editor asking about German needs to see. `gap` is the filter: `missing_answer` for entries the public page drops, `missing_locale` for questions that do not exist in that language yet.",
      tags: ["Admin"],
      successDescription: "A page of FAQ entries with their translations.",
      spec: withJsonBodyExample({ scope: "site", locale: "de", gap: "missing_answer" }),
    })
    .input(faqListInputSchema)
    .output(faqListSchema)
    .handler(({ context, input }) => listFaq(context.db, input)),
  get: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/get",
      operationId: "getFaqEntry",
      summary: "Get one FAQ entry with every translation",
      description:
        "Takes the id of any one locale's row and answers with the whole question — every translation of it, plus the locales it has none in. That is what the editor opens, because a question is edited in four languages at once.",
      tags: ["Admin"],
      successDescription: "The entry the row belongs to.",
      spec: withJsonBodyExample({ id: "faq_site_en_booking_1" }),
    })
    .input(faqIdInputSchema)
    .output(faqGroupSchema)
    .handler(({ context, input }) => getFaqGroup(context.db, input.id)),
  create: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/create",
      operationId: "createFaqEntry",
      summary: "Create an FAQ entry",
      description:
        "Writes one row per supplied translation, all sharing a scope, a category and a position, which is what makes them one question rather than four. A site-wide entry (no `listingId`) must name a category — `faq_scope_ck` says so, and this refuses it as a field error rather than letting the constraint surface as a 500. Answers may be left out: an unanswered question is a real entry holding its place, and the public page simply omits it. Writes an audit log entry per row, then asks the web app to drop its cached catalog reads and reports whether it could.",
      tags: ["Admin"],
      successDescription: "The created entry with its translations, and what the cache drop did.",
      spec: withJsonBodyExample({
        listingId: null,
        category: "booking",
        translations: [
          { locale: "en", question: "How do I book a yacht?" },
          { locale: "de", question: "Wie buche ich eine Yacht?" },
        ],
      }),
    })
    .input(faqCreateInputSchema)
    .output(faqEntryResultSchema)
    .handler(({ context, input }) => createFaqEntry(context.db, context.session.user.id, input)),
  update: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/update",
      operationId: "updateFaqEntry",
      summary: "Update an FAQ entry and its translations",
      description:
        "Addressed by the id of any one of its rows. Each supplied translation is written, and a locale that had no row yet gets one — that is how a missing translation is filled in. Locales left out keep their wording and still follow the entry if its scope changes, so a partial form cannot split a question in two. Removing a translation is `delete`. Writes an audit log entry per row, then asks the web app to drop its cached catalog reads and reports whether it could.",
      tags: ["Admin"],
      successDescription: "The updated entry with its translations, and what the cache drop did.",
      spec: withJsonBodyExample({
        id: "faq_site_en_booking_1",
        listingId: null,
        category: "booking",
        translations: [
          { locale: "en", question: "How do I book a yacht?", answer: "Pick your dates…" },
        ],
      }),
    })
    .input(faqUpdateInputSchema)
    .output(faqEntryResultSchema)
    .handler(({ context, input }) => updateFaqEntry(context.db, context.session.user.id, input)),
  delete: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/delete",
      operationId: "deleteFaqEntry",
      summary: "Delete an FAQ translation or a whole entry",
      description:
        "Deletes the single locale row `id` names, or with `allLocales` the question in every language it exists in. Writes an audit log entry per deleted row, carrying the wording, so a deletion can be read back out of the trail, then asks the web app to drop its cached catalog reads.",
      tags: ["Admin"],
      successDescription: "The ids that were deleted.",
      spec: withJsonBodyExample({ id: "faq_site_de_booking_1", allLocales: false }),
    })
    .input(faqDeleteInputSchema)
    .output(faqDeletedSchema)
    .handler(({ context, input }) => deleteFaqEntry(context.db, context.session.user.id, input)),
  reorder: adminProcedure
    .route({
      method: "POST",
      path: "/admin/faq/reorder",
      operationId: "reorderFaqEntries",
      summary: "Reorder one category's FAQ entries",
      description:
        "Takes the whole list for one scope and category as it reads in `locale`, in its new order, and writes `sort_order`. Every translation moves with its question: the four locale rows share their position, and the site would otherwise list the same questions in a different order per language. Entries with no row in `locale` cannot be placed by someone who cannot see them, so they keep their relative order and settle after the ones named. Partial orders are refused. Writes one audit log entry, then asks the web app to drop its cached catalog reads.",
      tags: ["Admin"],
      successDescription: "The category's entries in their new order.",
      spec: withJsonBodyExample({
        listingId: null,
        category: "booking",
        locale: "en",
        ids: ["faq_site_en_booking_2", "faq_site_en_booking_1"],
      }),
    })
    .input(faqReorderInputSchema)
    .output(faqReorderedSchema)
    .handler(({ context, input }) => reorderFaq(context.db, context.session.user.id, input)),
};
