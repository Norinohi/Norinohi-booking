import { log } from "evlog";
import { z } from "zod";

import { formatNausysDate } from "../shared/dates";
import { decimalStringToMinor } from "../shared/money";
import type { ProviderInvoice } from "../types";
import type { NausysClient } from "./client";
import { nausysEndpoints } from "./endpoints";

/*
 * What NauSYS has invoiced in the agency's name.
 *
 * Not the operator's bill to us. On the vendor's test company (Sep 2026) the agency export
 * answered with the agency's own commission invoice to the charter company, one line
 * `AG-COMM-1` "Agencijska provizija" per reservation, issued to the operator. That is what is
 * worth reading here: the commission NauSYS says we earned on a reservation, to set against
 * the commission the quote was priced on.
 *
 * The envelope carries no `status` at all, only `invoices` and a `summary`, which is why the
 * client lets this one endpoint through without one.
 */

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);

const invoiceLineSchema = z.looseObject({
  ident: z.string().optional(),
  identname: z.string().optional(),
  totalaltpricewithouttax: decimal.optional(),
  vatrate: decimal.optional(),
});

const invoiceSchema = z.looseObject({
  number: z.string().min(1),
  /* yyyy-MM-dd here, unlike every other date the vendor sends. */
  date: z.iso.date(),
  reservationnumber: z.string().optional(),
  type: z.string().optional(),
  altcurrency: z.string().length(3),
  totalaltprice: decimal,
  totalaltpricewithouttax: decimal,
  documentLink: z.url().optional(),
  items: z.looseObject({ items: z.array(invoiceLineSchema).optional() }).optional(),
});

const invoicesExportSchema = z.looseObject({
  invoices: z.array(z.json()).optional(),
});

export async function listNausysAgencyInvoices(
  client: NausysClient,
  window: { from: string; to: string },
): Promise<ProviderInvoice[]> {
  const answer = await client.bookingCall(
    nausysEndpoints.sales.agencyInvoices,
    invoicesExportSchema,
    { periodFrom: formatNausysDate(window.from), periodTo: formatNausysDate(window.to) },
  );

  const invoices: ProviderInvoice[] = [];
  for (const row of answer.invoices ?? []) {
    /* Row by row: one invoice in a shape we do not know costs that invoice, not the window. */
    const parsed = invoiceSchema.safeParse(row);
    if (!parsed.success) {
      log.warn({
        action: "nausys.invoice_unreadable",
        issues: parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      continue;
    }
    invoices.push(toProviderInvoice(parsed.data));
  }
  return invoices;
}

function toProviderInvoice(invoice: z.infer<typeof invoiceSchema>): ProviderInvoice {
  const currency = invoice.altcurrency.toUpperCase();
  return {
    number: invoice.number,
    issuedOn: invoice.date,
    ...(invoice.reservationnumber ? { providerReservationId: invoice.reservationnumber } : null),
    currency,
    totalMinor: decimalStringToMinor(invoice.totalaltprice, currency),
    netMinor: decimalStringToMinor(invoice.totalaltpricewithouttax, currency),
    ...(invoice.documentLink ? { documentUrl: invoice.documentLink } : null),
    lines: (invoice.items?.items ?? []).flatMap((line) =>
      line.totalaltpricewithouttax === undefined
        ? []
        : [
            {
              code: line.ident ?? "",
              label: line.identname ?? "",
              netMinor: decimalStringToMinor(line.totalaltpricewithouttax, currency),
              ...(line.vatrate === undefined ? null : { vatRate: Number(line.vatrate) }),
            },
          ],
    ),
  };
}
