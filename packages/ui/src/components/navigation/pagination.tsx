"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

/*
 * Pagination — Figma "Pagination" / "Pagination Item" (nodes 755:4481 / 755:4492) plus the
 * mobile "pagination" dots (node 736:8696), Tabs & Table frame. 32px square triggers, 6px
 * radius, Medium 14; the active page fills natural-50 with a natural-100 border. Prev/next
 * and overflow render 24px icons. `PaginationDots` is the compact mobile indicator.
 */
const paginationItemVariants = cva(
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-sm font-medium text-foreground outline-none transition-colors hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-6",
  {
    variants: {
      active: { true: "border-input bg-natural-50", false: "" },
    },
    defaultVariants: { active: false },
  },
);

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

type PaginationItemProps = React.ComponentProps<"button"> &
  VariantProps<typeof paginationItemVariants>;

function PaginationItem({ className, active, ...props }: PaginationItemProps) {
  return (
    <button
      type="button"
      data-slot="pagination-item"
      aria-current={active ? "page" : undefined}
      className={cn(paginationItemVariants({ active }), className)}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: PaginationItemProps) {
  return (
    <PaginationItem aria-label="Go to previous page" className={className} {...props}>
      <ChevronLeft />
    </PaginationItem>
  );
}

function PaginationNext({ className, ...props }: PaginationItemProps) {
  return (
    <PaginationItem aria-label="Go to next page" className={className} {...props}>
      <ChevronRight />
    </PaginationItem>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center text-foreground [&_svg]:size-6",
        className,
      )}
      {...props}
    >
      <MoreHorizontal />
    </span>
  );
}

/** Mobile dots indicator — Figma "pagination / Dots" (node 614:7934). Active dot elongates to brand. */
function PaginationDots({
  count,
  active,
  className,
  ...props
}: React.ComponentProps<"div"> & { count: number; active: number }) {
  return (
    <div
      data-slot="pagination-dots"
      className={cn("flex items-center justify-center gap-1.5", className)}
      {...props}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          data-active={i === active || undefined}
          className={cn(
            "h-2 rounded-full transition-all",
            i === active ? "w-4 bg-brand" : "w-2 bg-natural-200",
          )}
        />
      ))}
    </div>
  );
}

/*
 * PaginationControl — the ready-made control: primitives above are the escape hatch,
 * this is what pages import. Slot count is stable (7 with the defaults) so the row
 * never reflows as you page: `1 2 3 4 5 … 46`, `1 … 41 42 43 … 46`, `1 … 42 43 44 45 46`.
 */
type PaginationSlot = number | "gap";

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, index) => from + index);
}

function getPaginationRange({
  page,
  pageCount,
  siblings = 1,
  boundaries = 1,
}: {
  page: number;
  pageCount: number;
  siblings?: number;
  boundaries?: number;
}): PaginationSlot[] {
  const slots = siblings * 2 + boundaries * 2 + 3;
  if (slots >= pageCount) return range(1, pageCount);

  const edgeCount = siblings * 2 + boundaries + 2;
  const leftSibling = Math.max(page - siblings, boundaries);
  const rightSibling = Math.min(page + siblings, pageCount - boundaries);
  const hasLeftGap = leftSibling > boundaries + 2;
  const hasRightGap = rightSibling < pageCount - (boundaries + 1);

  if (!hasLeftGap) {
    return [...range(1, edgeCount), "gap", ...range(pageCount - boundaries + 1, pageCount)];
  }
  if (!hasRightGap) {
    return [...range(1, boundaries), "gap", ...range(pageCount - edgeCount + 1, pageCount)];
  }
  return [
    ...range(1, boundaries),
    "gap",
    ...range(leftSibling, rightSibling),
    "gap",
    ...range(pageCount - boundaries + 1, pageCount),
  ];
}

type PaginationRange = { from: number; to: number; total: number };

type PaginationControlProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  page: number;
  onPageChange: (page: number) => void;
  /** Total item count. Together with `pageSize` it derives `pageCount` and the summary. */
  total?: number;
  pageSize?: number;
  /** Overrides the count derived from `total` / `pageSize`. */
  pageCount?: number;
  /** Pages either side of the current one in the middle window. */
  siblings?: number;
  /** Pages pinned at each end. */
  boundaries?: number;
  /** `false` hides the summary; a function replaces its text. */
  summary?: false | ((range: PaginationRange) => React.ReactNode);
};

function PaginationControl({
  page,
  onPageChange,
  total,
  pageSize,
  pageCount,
  siblings,
  boundaries,
  summary,
  className,
  ...props
}: PaginationControlProps) {
  const count = pageCount ?? (total && pageSize ? Math.ceil(total / pageSize) : 1);
  const current = Math.min(Math.max(page, 1), count);

  const itemRange: PaginationRange | null =
    summary !== false && total !== undefined && pageSize !== undefined
      ? { from: (current - 1) * pageSize + 1, to: Math.min(current * pageSize, total), total }
      : null;

  return (
    <div
      data-slot="pagination-control"
      className={cn(
        "flex flex-col-reverse items-center gap-3 md:flex-row md:justify-between",
        className,
      )}
      {...props}
    >
      <Pagination>
        <PaginationPrevious disabled={current === 1} onClick={() => onPageChange(current - 1)} />
        {getPaginationRange({ page: current, pageCount: count, siblings, boundaries }).map(
          (slot, index) =>
            slot === "gap" ? (
              <PaginationEllipsis key={`gap-${index}`} />
            ) : (
              <PaginationItem
                key={slot}
                active={slot === current}
                onClick={() => onPageChange(slot)}
              >
                {slot}
              </PaginationItem>
            ),
        )}
        <PaginationNext disabled={current === count} onClick={() => onPageChange(current + 1)} />
      </Pagination>

      {itemRange ? (
        <p className="text-sm font-medium leading-[1.3] text-natural-500">
          {summary ? (
            summary(itemRange)
          ) : (
            <>
              Showing {itemRange.from}-{itemRange.to} of {itemRange.total}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

export {
  getPaginationRange,
  Pagination,
  PaginationControl,
  PaginationDots,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
};
