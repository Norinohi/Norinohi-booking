"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@yacht-charter/ui/lib/utils";
import * as React from "react";

/*
 * Tabs — Figma "Tabs" / "Tab Item" (nodes 824:176298 / 824:175922), Tabs & Table frame.
 * variant "lined": underlined tabs — Medium 14 natural-500 turns Bold 14 foreground when
 * active, with a 2px brand indicator sliding under the selected tab.
 * variant "segmented": a bordered white pill group; the active segment gets a brand-50 fill,
 * a brand border and brand text. Set orientation="vertical" for the mobile segmented layout.
 */
const TabsVariantContext = React.createContext<"lined" | "segmented">("lined");

type TabsProps = TabsPrimitive.Root.Props & { variant?: "lined" | "segmented" };

function Tabs({ variant = "lined", className, ...props }: TabsProps) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-4 data-[orientation=vertical]:flex-row", className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "relative flex items-center",
        variant === "lined" &&
          "gap-5 border-b border-natural-50 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:border-0",
        variant === "segmented" &&
          "gap-2 rounded-lg border border-input bg-popover p-1.5 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
        className,
      )}
      {...props}
    >
      {children}
      {variant === "lined" && (
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          className="absolute bottom-0 left-0 h-0.5 w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] rounded-t-sm bg-brand transition-all duration-200"
        />
      )}
    </TabsPrimitive.List>
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "cursor-pointer whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        variant === "lined" &&
          "px-0 pt-4 pb-3 text-sm font-medium text-natural-500 data-[active]:font-bold data-[active]:text-foreground",
        variant === "segmented" &&
          "rounded-md border border-transparent px-4 py-4 text-center text-base text-foreground data-[active]:border-brand data-[active]:bg-brand-50 data-[active]:text-brand",
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsPanel, TabsTab };
