"use client";

import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Table — Figma "Table" / "Table row" / "Table Cell" / "Table Header"
 * (nodes 853:55430 / 853:55365 / 853:55343 / 853:55360), Tabs & Table frame.
 * Header row: natural-50 fill, Bold 16, rounded top corners. Body cells: Regular 16,
 * 20/14 padding, natural-50 bottom divider, optional 12 SemiBold caption. Badge cells
 * simply nest a <Chip>. The container scrolls horizontally on narrow screens.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn(
          "w-full border-separate border-spacing-0 text-left text-base text-foreground",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn(className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 border-b border-natural-50 bg-natural-50 px-5 py-3.5 text-left align-middle text-base font-bold whitespace-nowrap text-foreground first:rounded-tl-md last:rounded-tr-md",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-[46px] border-b border-natural-50 px-5 py-3.5 align-middle text-base text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Secondary caption line inside a cell — Figma "helper text" (12 SemiBold, natural-300). */
function TableCellCaption({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="table-cell-caption"
      className={cn("block text-xs leading-tight font-semibold text-natural-300", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableCellCaption, TableHead, TableHeader, TableRow };
