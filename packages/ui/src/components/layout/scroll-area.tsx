"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * ScrollArea — Figma "Scroll Bar" (node 755:22227), Inputs & Selection frame.
 * A 4px scrollbar with a natural-50 (#f8f8f8) track and a natural-900 (#0a0a0a) thumb,
 * both pill-rounded. Wraps arbitrary content in a scrollable viewport.
 * The viewport fills the root via flex rather than a percentage height, so the
 * root can be sized either explicitly (`h-[200px]`) or by a parent flex row.
 */
function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none rounded-full bg-natural-50 p-px select-none",
        orientation === "vertical" && "h-full w-1",
        orientation === "horizontal" && "h-1 w-full flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="flex-1 rounded-full bg-natural-900"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

function ScrollArea({ className, children, ...props }: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative flex flex-col overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="min-h-0 w-full flex-1 overscroll-contain rounded-[inherit] outline-none"
      >
        {/* Undoes base-ui's inline `min-width: fit-content`; only a class would lose to it. */}
        <ScrollAreaPrimitive.Content className="w-full" style={{ minWidth: 0 }}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
    </ScrollAreaPrimitive.Root>
  );
}

export { ScrollArea, ScrollBar };
