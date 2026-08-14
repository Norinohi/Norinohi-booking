import { ORPCError } from "@orpc/server";
import { user } from "@yacht-charter/db/schema/auth";
import { booking } from "@yacht-charter/db/schema/booking";
import { bookingEnquiry } from "@yacht-charter/db/schema/checkout";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  enquiryAnswerInputSchema,
  enquiryListInputSchema,
  enquiryListSchema,
  enquiryRowSchema,
  enquirySetStatusInputSchema,
} from "../contracts/enquiry";
import { writeAuditLog } from "./audit";
import { notifyEnquiryAnswered, notifyStaff } from "./enquiry-email";
import { paginatedQuery, totalFrom } from "./pagination";

type ListInput = z.infer<typeof enquiryListInputSchema>;
type ListResult = z.infer<typeof enquiryListSchema>;
type Row = z.infer<typeof enquiryRowSchema>;
type AnswerInput = z.infer<typeof enquiryAnswerInputSchema>;
type SetStatusInput = z.infer<typeof enquirySetStatusInputSchema>;

/*
 * The read and write sides of `booking_enquiry`. `checkout.askQuestion` has always written to
 * this table and nothing ever read it, so every question a customer asked about their booking
 * was invisible outside the database. These are what the staff inbox is built on.
 */

/*
 * Every row carries its booking: an answer is meaningless without knowing which charter is
 * being asked about, and staff should not have to look the reference up separately. The
 * customer's own name and address come from the account, which is the one place they are
 * current — a booking's guest snapshot is frozen at checkout.
 */
const ROW_COLUMNS = {
  id: bookingEnquiry.id,
  status: bookingEnquiry.status,
  question: bookingEnquiry.question,
  answer: bookingEnquiry.answer,
  answeredAt: bookingEnquiry.answeredAt,
  createdAt: bookingEnquiry.createdAt,
  bookingId: booking.id,
  reference: booking.reference,
  bookingStatus: booking.status,
  commercialSnapshot: booking.commercialSnapshot,
  checkIn: quote.checkIn,
  checkOut: quote.checkOut,
  customerName: user.name,
  customerEmail: user.email,
};

/* One place builds the join, so the row type is inferred rather than restated. */
function selectEnquiries(db: Database) {
  return db
    .select(ROW_COLUMNS)
    .from(bookingEnquiry)
    .innerJoin(booking, eq(booking.id, bookingEnquiry.bookingId))
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .innerJoin(user, eq(user.id, bookingEnquiry.userId));
}

type SelectedRow = Awaited<ReturnType<typeof selectEnquiries>>[number];

function present(row: SelectedRow): Row {
  return {
    id: row.id,
    status: row.status,
    question: row.question,
    answer: row.answer,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    bookingId: row.bookingId,
    reference: row.reference,
    bookingStatus: row.bookingStatus,
    listingTitle: row.commercialSnapshot.listingTitle,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
  };
}

export async function listEnquiries(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.status) filters.push(eq(bookingEnquiry.status, input.status));
  if (input.query) {
    const pattern = `%${input.query}%`;
    filters.push(or(ilike(user.email, pattern), ilike(booking.reference, pattern)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      selectEnquiries(db)
        .where(where)
        .orderBy(desc(bookingEnquiry.createdAt), desc(bookingEnquiry.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(
        await db
          .select({ totalItems: count() })
          .from(bookingEnquiry)
          .innerJoin(booking, eq(booking.id, bookingEnquiry.bookingId))
          .innerJoin(user, eq(user.id, bookingEnquiry.userId))
          .where(where),
      ),
  });

  return { items: rows.map(present), pagination };
}

async function readOne(db: Database, id: string): Promise<SelectedRow> {
  const [row] = await selectEnquiries(db).where(eq(bookingEnquiry.id, id)).limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown enquiry" });
  return row;
}

/**
 * Records the reply and sends it to the customer, which is the whole point of the inbox: an
 * answer that stays in the table is the same silence the question landed in. The email is
 * best-effort (see ./enquiry-email), so a mail failure never loses the recorded answer.
 */
export async function answerEnquiry(
  db: Database,
  actorUserId: string,
  input: AnswerInput,
): Promise<Row> {
  const before = await readOne(db, input.id);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookingEnquiry)
      .set({
        answer: input.answer,
        answeredAt: new Date(),
        status: input.close ? "closed" : "answered",
      })
      .where(eq(bookingEnquiry.id, input.id))
      .returning({ id: bookingEnquiry.id });

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "booking_enquiry",
      entityId: input.id,
      before: { status: before.status, answer: before.answer },
      after: { status: input.close ? "closed" : "answered", answer: input.answer },
    });

    return row;
  });

  if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

  await notifyEnquiryAnswered({
    to: before.customerEmail,
    customerName: before.customerName,
    reference: before.reference,
    yachtName: before.commercialSnapshot.listingTitle,
    question: before.question,
    answer: input.answer,
    bookingId: before.bookingId,
  });

  return present(await readOne(db, input.id));
}

/**
 * Tells staff a question arrived. Called from the router rather than from `askQuestion` itself:
 * that service is reached by pure unit tests, and pulling the environment-reading email module
 * into its import graph would fail them at load. The inbox is the durable record either way —
 * this is only the tap on the shoulder, so a failure here never fails the question.
 */
export async function announceEnquiry(db: Database, id: string): Promise<void> {
  const row = await readOne(db, id);

  await notifyStaff({
    title: `New question on booking ${row.reference}`,
    facts: [
      { label: "From", value: `${row.customerName} (${row.customerEmail})` },
      { label: "Yacht", value: row.commercialSnapshot.listingTitle },
      { label: "Charter", value: `${row.checkIn} → ${row.checkOut}` },
    ],
    body: row.question,
    path: "/inbox",
    actionLabel: "Open the inbox",
  });
}

/** Reopening or closing without a reply — the pipeline move, not the answer. */
export async function setEnquiryStatus(
  db: Database,
  actorUserId: string,
  input: SetStatusInput,
): Promise<Row> {
  const before = await readOne(db, input.id);

  await db.transaction(async (tx) => {
    await tx
      .update(bookingEnquiry)
      .set({ status: input.status })
      .where(eq(bookingEnquiry.id, input.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "booking_enquiry",
      entityId: input.id,
      before: { status: before.status },
      after: { status: input.status },
    });
  });

  return present(await readOne(db, input.id));
}
