import { ORPCError } from "@orpc/server";
import { lead } from "@yacht-charter/db/schema/lead";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  leadAnswerInputSchema,
  leadCreatedSchema,
  leadCreateInputSchema,
  leadListInputSchema,
  leadListSchema,
  leadSchema,
  leadStatusSchema,
} from "../contracts/lead";
import { writeAuditLog } from "./audit";
import { notifyLeadAnswered, notifyLeadReceived } from "./lead-email";
import { paginatedQuery, totalFrom } from "./pagination";
type CreateInput = z.infer<typeof leadCreateInputSchema>;
type AnswerInput = z.infer<typeof leadAnswerInputSchema>;

type Created = z.infer<typeof leadCreatedSchema>;
type ListInput = z.infer<typeof leadListInputSchema>;
type ListResult = z.infer<typeof leadListSchema>;
type Lead = z.infer<typeof leadSchema>;
type Status = z.infer<typeof leadStatusSchema>;

/**
 * Records an enquiry from Request Quote, Contact a charter expert, or Get
 * Consultation. Staff read these through admin.lead.list; the customer gets an
 * acknowledgement so the form does not end in silence, carrying the yacht they
 * asked about (or the one the planner suggested) as a link back into the site.
 */
export async function createLead(
  db: Database,
  userId: string | null,
  input: CreateInput,
): Promise<Created> {
  // A dangling listingId would send staff to a yacht that no longer exists. The same read
  // returns what the customer's email shows: the name, the link, and the photo. The search
  // doc is the one place all three sit together, and it is what the catalogue renders from.
  let subject: { title: string; slug: string; mainImage: string | null } | undefined;
  if (input.listingId) {
    const [exists] = await db
      .select({
        title: listingSearchDoc.title,
        slug: listingSearchDoc.slug,
        mainImage: listingSearchDoc.mainImage,
      })
      .from(listingSearchDoc)
      .where(eq(listingSearchDoc.listingId, input.listingId))
      .limit(1);

    if (!exists) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });
    subject = exists;
  }

  const [created] = await db
    .insert(lead)
    .values({
      kind: input.kind,
      userId,
      listingId: input.listingId ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message ?? null,
      context: input.context ?? null,
    })
    .returning({
      id: lead.id,
      kind: lead.kind,
      status: lead.status,
      createdAt: lead.createdAt,
    });

  if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not save enquiry" });

  await notifyLeadReceived({
    to: input.email,
    name: input.name,
    kind: input.kind,
    message: input.message,
    yacht: subject,
  });

  return {
    id: created.id,
    kind: created.kind,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listLeads(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.kind) filters.push(eq(lead.kind, input.kind));
  if (input.status) filters.push(eq(lead.status, input.status));
  if (input.query) {
    const pattern = `%${input.query}%`;
    filters.push(or(ilike(lead.name, pattern), ilike(lead.email, pattern)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({ lead, listingTitle: listing.title })
        .from(lead)
        .leftJoin(listing, eq(listing.id, lead.listingId))
        .where(where)
        .orderBy(desc(lead.createdAt), desc(lead.id))
        .limit(limit)
        .offset(offset),
    total: async () => totalFrom(await db.select({ totalItems: count() }).from(lead).where(where)),
  });

  return { items: rows.map((row) => present(row.lead, row.listingTitle)), pagination };
}

export async function setLeadStatus(
  db: Database,
  actorUserId: string,
  id: string,
  status: Status,
): Promise<Lead> {
  const [before] = await db.select().from(lead).where(eq(lead.id, id)).limit(1);
  if (!before) throw new ORPCError("NOT_FOUND", { message: "Unknown enquiry" });

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(lead)
      .set({
        status,
        handledByUserId: actorUserId,
        // Stamped when it leaves "new" and cleared if it is put back, so the
        // timestamp always means "when someone picked this up".
        handledAt: status === "new" ? null : new Date(),
      })
      .where(eq(lead.id, id))
      .returning();

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "lead",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });

    return row;
  });

  if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

  const [listingRow] = updated.listingId
    ? await db
        .select({ title: listing.title })
        .from(listing)
        .where(eq(listing.id, updated.listingId))
        .limit(1)
    : [];

  return present(updated, listingRow?.title ?? null);
}

/**
 * Records the reply and sends it to the enquirer. Until this existed a lead could only be
 * marked "contacted", with the reply itself written from someone's own mail client — invisible
 * to everyone else. The email is best-effort (see ./lead-email), so a mail failure never loses
 * the recorded answer. Answering closes the lead unless `close` is false.
 */
export async function answerLead(
  db: Database,
  actorUserId: string,
  input: AnswerInput,
): Promise<Lead> {
  const [before] = await db.select().from(lead).where(eq(lead.id, input.id)).limit(1);
  if (!before) throw new ORPCError("NOT_FOUND", { message: "Unknown enquiry" });

  // The yacht the enquiry named, for the email's link back into the site. The search doc is
  // where the slug lives, and a lead that named none is answered without a call to action.
  const [subject] = before.listingId
    ? await db
        .select({ title: listingSearchDoc.title, slug: listingSearchDoc.slug })
        .from(listingSearchDoc)
        .where(eq(listingSearchDoc.listingId, before.listingId))
        .limit(1)
    : [];

  const status = input.close ? "closed" : "contacted";

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(lead)
      .set({
        answer: input.answer,
        answeredAt: new Date(),
        status,
        handledByUserId: actorUserId,
        handledAt: new Date(),
      })
      .where(eq(lead.id, input.id))
      .returning();

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "lead",
      entityId: input.id,
      before: { status: before.status, answer: before.answer },
      after: { status, answer: input.answer },
    });

    return row;
  });

  if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

  await notifyLeadAnswered({
    to: before.email,
    name: before.name,
    question: before.message ?? undefined,
    answer: input.answer,
    yacht: subject,
  });

  return present(updated, subject?.title ?? null);
}

function present(row: typeof lead.$inferSelect, listingTitle: string | null): Lead {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    listingId: row.listingId,
    listingTitle,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    context: row.context ?? null,
    answer: row.answer,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    handledAt: row.handledAt?.toISOString() ?? null,
  };
}
