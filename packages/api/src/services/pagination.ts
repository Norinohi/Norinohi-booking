import type { z } from "zod";

import type { paginationSchema } from "../contracts/catalog";

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
