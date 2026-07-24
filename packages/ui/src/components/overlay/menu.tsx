"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/*
 * Menu & MenuItem — Figma "Menu Item" (nodes 733:13228 input / 755:21733 search) and the
 * "Menu Item" list panel (node 755:11770), Inputs & Selection frame. Menu is a white card
 * (1px natural-100 border, 8px radius, 4/4/10 shadow, 16/12 padding). MenuItem is a 14 SemiBold
 * row: `item` is a bottom-divided list entry, `search` is a bordered search field. Optional
 * start/end slots hold 24px icons or a control (Checkbox, Radio…).
 */
const menuItemVariants = cva(
  "flex w-full items-center gap-2 text-sm font-semibold capitalize tracking-[0.02em] outline-none [&_svg]:size-6",
  {
    variants: {
      variant: {
        item: "cursor-default border-b border-natural-50 pt-2 pb-4 text-foreground last:border-b-0 hover:text-brand",
        search: "rounded-lg border border-input p-3 text-natural-300",
      },
    },
    defaultVariants: { variant: "item" },
  },
);

type MenuItemProps = React.ComponentProps<"div"> &
  VariantProps<typeof menuItemVariants> & {
    startSlot?: React.ReactNode;
    endSlot?: React.ReactNode;
  };

function MenuItem({
  className,
  variant = "item",
  startSlot,
  endSlot,
  children,
  ...props
}: MenuItemProps) {
  return (
    <div data-slot="menu-item" className={cn(menuItemVariants({ variant }), className)} {...props}>
      {startSlot != null && <span className="flex shrink-0 items-center">{startSlot}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {endSlot != null && <span className="flex shrink-0 items-center">{endSlot}</span>}
    </div>
  );
}

function Menu({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="menu"
      className={cn(
        "flex min-w-[200px] flex-col gap-2 rounded-lg border border-input bg-popover px-4 py-3 text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)]",
        className,
      )}
      {...props}
    />
  );
}

export { Menu, MenuItem, menuItemVariants };
