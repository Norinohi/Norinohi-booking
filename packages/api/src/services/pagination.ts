import type { z } from "zod";

import type { paginationSchema } from "../contracts/primitives";

type Pagination = z.infer<typeof paginationSchema>;

/**
 * Mirrors paginationFor in packages/db/src/search/repository.ts so every numbered
 * pager in the app serialises identically for the shared Pagination component.
 * The search read model builds its own inside SQL; this is for services that page
 * in Drizzle.
 */
export function paginationFor(input: {
  page: number;
  pageSize: number;
  totalItems: number;
  itemCount: number;
}): Pagination {
  const totalPages = Math.max(Math.ceil(input.totalItems / input.pageSize), 1);
  const startItem = input.itemCount > 0 ? (input.page - 1) * input.pageSize + 1 : 0;
  const endItem = input.itemCount > 0 ? startItem + input.itemCount - 1 : 0;

  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems: input.totalItems,
    totalPages,
    startItem,
    endItem,
    hasPreviousPage: input.page > 1,
    hasNextPage: input.page < totalPages,
  };
}

/**
 * Runs a page query and its count together and wraps the result.
 *
 * Each caller supplies its own two queries because the joins and filters differ;
 * what was duplicated was the limit/offset arithmetic and the envelope, which is
 * where an off-by-one silently misreports "showing 11-20 of 25".
 */
export async function paginatedQuery<Row>(input: {
  page: number;
  pageSize: number;
  rows: (limit: number, offset: number) => Promise<Row[]>;
  total: () => Promise<number>;
}): Promise<{ rows: Row[]; pagination: Pagination }> {
  const [rows, totalItems] = await Promise.all([
    input.rows(input.pageSize, (input.page - 1) * input.pageSize),
    input.total(),
  ]);

  return {
    rows,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      itemCount: rows.length,
    }),
  };
}

/** The count() shape every paged service uses, unwrapped to a plain number. */
export function totalFrom(rows: { totalItems: number }[]): number {
  return rows[0]?.totalItems ?? 0;
}
