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
  "flex size-8 shrink-0 cursor-default items-center justify-center rounded-md border border-transparent text-sm font-medium text-foreground outline-none transition-colors hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-6",
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

export {
  Pagination,
  PaginationDots,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
};
