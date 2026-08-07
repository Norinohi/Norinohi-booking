import { z } from "zod";

/*
 * The shapes every contract file needs. These previously lived in catalog.ts,
 * which is the listing-search contract — five of the ten contract files were
 * importing their money and pagination shapes out of it, and the rest declared
 * their own copies.
 */

/**
 * Normalises rather than merely validating, because currency arrives from query
 * strings and form posts as often as from our own code. The looser
 * `z.string().length(3)` this replaces rejected "eur" at ten sites while three
 * others accepted and upcased it; accepting it everywhere is the wider of the
 * two behaviours and matches what the database already stores.
 */
export const currencySchema = z.string().trim().length(3).toUpperCase();

/**
 * Deliberately validates rather than normalising: this is an output shape, and the
 * currency in it comes from a column we wrote, not from a request. Use
 * currencySchema on anything the client sends.
 */
export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

/** A calendar date, no time and no zone — what the charter period is expressed in. */
export const isoDateSchema = z.iso.date();

export const idSchema = z.string().min(1);

/** Procedures that take no arguments still need a body the OpenAPI handler can bind. */
export const emptyInputSchema = z.object({}).default({});

/**
 * "end must not precede start", which six contracts had written out by hand with
 * six different field pairs. Comparison is lexicographic, which is exact for
 * ISO-8601 dates and is what the hand-written copies did too.
 *
 * The two rules are not interchangeable, so `exclusive` is explicit: a validity
 * window may open and close on the same day, whereas a charter that checks out
 * on its check-in date is zero nights.
 */
export function dateRangeRefinement<Start extends string, End extends string>(
  start: Start,
  end: End,
  message: string,
  options: { exclusive?: boolean } = {},
) {
  return (value: Partial<Record<Start | End, string | null | undefined>>, ctx: z.RefinementCtx) => {
    const from = value[start];
    const to = value[end];
    if (!from || !to) return;

    const invalid = options.exclusive ? to <= from : to < from;
    if (invalid) ctx.addIssue({ code: "custom", message, path: [end] });
  };
}

/** Envelope for every numbered pager in the app (search, wishlist, bookings, admin). */
export const paginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  startItem: z.number().int(),
  endItem: z.number().int(),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});

export function paginatedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), pagination: paginationSchema });
}

/**
 * `maxPageSize` and `defaultPageSize` stay per-call-site: the eight pagers they
 * replace disagree (48 for the wishlist grid, 50, 100) and each cap is a page
 * layout decision. Unifying them would change which requests are rejected.
 */
export function paginationInputSchema(options: { maxPageSize: number; defaultPageSize: number }) {
  const { maxPageSize, defaultPageSize } = options;

  return {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  };
}

/** The `.default()` a paginated input needs: z.default must satisfy the output type. */
export function paginationInputDefault(defaultPageSize: number) {
  return { page: 1, pageSize: defaultPageSize };
}
