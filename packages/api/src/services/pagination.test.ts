import { describe, expect, it } from "vitest";

import { paginationFor } from "./pagination";

/*
 * This is a deliberate copy of paginationFor in packages/db/src/search/repository.ts
 * (documented at the top of pagination.ts). The two bodies are currently byte-identical
 * apart from the name of the return type, so this file pins the shared contract for
 * both: the search read model builds its envelope in SQL, this one in Drizzle, and the
 * web app renders them through one Pagination component. If they ever drift, the two
 * pagers stop agreeing on startItem/endItem for the same page.
 */

describe("paginationFor", () => {
  it("describes a full first page", () => {
    expect(paginationFor({ page: 1, pageSize: 10, totalItems: 25, itemCount: 10 })).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
      startItem: 1,
      endItem: 10,
      hasPreviousPage: false,
      hasNextPage: true,
    });
  });

  it("offsets startItem by the pages already behind it", () => {
    expect(paginationFor({ page: 3, pageSize: 10, totalItems: 25, itemCount: 5 })).toMatchObject({
      startItem: 21,
      endItem: 25,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  it("reports zeros for an empty page rather than a 1..0 range", () => {
    expect(paginationFor({ page: 1, pageSize: 10, totalItems: 0, itemCount: 0 })).toMatchObject({
      totalPages: 1,
      startItem: 0,
      endItem: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    });
  });

  it("keeps totalPages at 1 when there are no items, so the pager still renders", () => {
    expect(paginationFor({ page: 1, pageSize: 20, totalItems: 0, itemCount: 0 }).totalPages).toBe(
      1,
    );
  });

  it("rounds a partial last page up", () => {
    expect(paginationFor({ page: 1, pageSize: 10, totalItems: 21, itemCount: 10 }).totalPages).toBe(
      3,
    );
  });

  it("still reports hasPreviousPage past the end of the range", () => {
    // Nothing clamps `page`, so an out-of-range request is described, not corrected.
    expect(paginationFor({ page: 9, pageSize: 10, totalItems: 25, itemCount: 0 })).toMatchObject({
      page: 9,
      totalPages: 3,
      startItem: 0,
      endItem: 0,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  it("handles a single item", () => {
    expect(paginationFor({ page: 1, pageSize: 10, totalItems: 1, itemCount: 1 })).toMatchObject({
      totalPages: 1,
      startItem: 1,
      endItem: 1,
      hasNextPage: false,
    });
  });

  it("handles a page size of one", () => {
    expect(paginationFor({ page: 2, pageSize: 1, totalItems: 3, itemCount: 1 })).toMatchObject({
      totalPages: 3,
      startItem: 2,
      endItem: 2,
      hasPreviousPage: true,
      hasNextPage: true,
    });
  });
});
