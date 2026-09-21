import { booking } from "@yacht-charter/db/schema/booking";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { providerInvoice } from "@yacht-charter/db/schema/provider-invoice";
import { quoteOfferAttempt } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderInvoice } from "@yacht-charter/providers";
import { thrownFields } from "@yacht-charter/providers/shared/log-fields";
import { and, eq, inArray, sql } from "drizzle-orm";
import { log, parseError } from "evlog";

import type { Database } from "../context";
import {
  type CommissionMismatch,
  commissionMismatchOf,
  type HeldBooking,
} from "../lib/invoice-commission";
import { providerByKey } from "./provider-routing";

/**
 * Vendors whose invoices we read. NauSYS alone exports them; Booking Manager has no such feed.
 */
const INVOICING_PROVIDERS = ["nausys"] as const;

/**
 * How far back each run reads. An invoice is issued at or after the charter and can be
 * corrected afterwards, and the window is cheap: one call answers for all of it.
 */
const WINDOW_DAYS = 45;

export interface InvoiceSyncResult {
  recorded: number;
  /** Invoices naming a reservation we hold no booking for. */
  unmatched: number;
  /** Bookings whose invoiced commission differs from the one the quote was priced on. */
  commissionMismatches: CommissionMismatch[];
  unreachable: string[];
}

/**
 * Reads what each vendor invoiced in our name and files it beside the booking it is for.
 *
 * Reports, never corrects: a commission the vendor invoiced differently from the one we
 * priced on is a conversation with the operator, and nothing we hold is wrong because of it.
 */
export async function syncProviderInvoices(
  db: Database,
  fallback: InventoryProvider,
  now: Date = new Date(),
  codes: readonly string[] = INVOICING_PROVIDERS,
): Promise<InvoiceSyncResult> {
  const result: InvoiceSyncResult = {
    recorded: 0,
    unmatched: 0,
    commissionMismatches: [],
    unreachable: [],
  };
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  for (const code of codes) {
    const adapter = await providerByKey(fallback, code);
    if (!adapter.listInvoices) continue;

    const [row] = await db
      .select({ id: providerTable.id })
      .from(providerTable)
      .where(eq(providerTable.code, code))
      .limit(1);
    if (!row) continue;

    let invoices: ProviderInvoice[];
    try {
      invoices = await adapter.listInvoices({ from, to });
    } catch (cause) {
      log.warn({
        action: "provider_invoice.unreachable",
        provider: code,
        ...thrownFields(parseError(cause)),
      });
      result.unreachable.push(code);
      continue;
    }

    const bookings = await bookingsFor(db, code, invoices);
    for (const invoice of invoices) {
      const held = invoice.providerReservationId
        ? bookings.get(invoice.providerReservationId)
        : undefined;
      if (!held) result.unmatched += 1;

      const values = {
        providerId: row.id,
        number: invoice.number,
        issuedOn: invoice.issuedOn,
        providerReservationId: invoice.providerReservationId ?? null,
        bookingId: held?.id ?? null,
        currency: invoice.currency,
        totalMinor: invoice.totalMinor,
        netMinor: invoice.netMinor,
        documentUrl: invoice.documentUrl ?? null,
        lines: invoice.lines,
      };
      await db
        .insert(providerInvoice)
        .values(values)
        .onConflictDoUpdate({
          target: [providerInvoice.providerId, providerInvoice.number],
          set: { ...values, updatedAt: sql`now()` },
        });
      result.recorded += 1;

      const mismatch = held ? commissionMismatchOf(invoice, held) : null;
      if (mismatch) result.commissionMismatches.push(mismatch);
    }
  }

  for (const mismatch of result.commissionMismatches) {
    log.warn({ action: "provider_invoice.commission_mismatch", ...mismatch });
  }
  return result;
}

/** Our bookings on the reservations these invoices name, with the commission each was won on. */
async function bookingsFor(
  db: Database,
  code: string,
  invoices: readonly ProviderInvoice[],
): Promise<Map<string, HeldBooking>> {
  const ids = [...new Set(invoices.flatMap((invoice) => invoice.providerReservationId ?? []))];
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: booking.id,
      reference: booking.reference,
      providerReservationId: booking.providerReservationId,
      commissionMinor: quoteOfferAttempt.commissionMinor,
      currency: quoteOfferAttempt.currency,
    })
    .from(booking)
    .leftJoin(
      quoteOfferAttempt,
      and(eq(quoteOfferAttempt.quoteId, booking.quoteId), eq(quoteOfferAttempt.outcome, "won")),
    )
    .where(and(eq(booking.provider, code), inArray(booking.providerReservationId, ids)));

  return new Map(
    rows.flatMap((item) =>
      item.providerReservationId === null
        ? []
        : [
            [
              item.providerReservationId,
              {
                id: item.id,
                reference: item.reference,
                commissionMinor: item.commissionMinor,
                currency: item.currency,
              },
            ] as const,
          ],
    ),
  );
}
