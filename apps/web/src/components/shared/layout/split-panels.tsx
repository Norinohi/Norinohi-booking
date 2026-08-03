"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { cn } from "@yacht-charter/ui/lib/utils";
import { type ReactNode, useState } from "react";

import { useFillToFold } from "@/hooks/use-fill-to-fold";

const PANELS = ["main", "aside"] as const;

type Panel = (typeof PANELS)[number];

export default function SplitPanels({
  labels,
  main,
  aside,
}: {
  /** Tab labels below `xl`, where the two panels share the screen. */
  labels: Record<Panel, ReactNode>;
  main: ReactNode;
  aside: ReactNode;
}) {
  const [panel, setPanel] = useState<Panel>(PANELS[0]);
  const asideRef = useFillToFold<HTMLElement>("80rem");

  return (
    <div className="mx-auto flex w-full max-w-349 flex-col gap-6 md:gap-8">
      <Tabs
        variant="segmented"
        value={panel}
        onValueChange={(value) => setPanel(value as Panel)}
        className="sticky top-(--header-h) z-20 bg-background xl:hidden"
      >
        <TabsList>
          {PANELS.map((id) => (
            <TabsTab key={id} value={id} className="flex-1 py-3.5 leading-5.5">
              {labels[id]}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_334px]">
        <div className={cn("flex min-w-0 flex-col gap-6", panel !== "main" && "max-xl:hidden")}>
          {main}
        </div>

        <aside
          ref={asideRef}
          className={cn(
            "flex xl:sticky xl:top-[calc(var(--header-h)+1.5rem)] xl:max-h-[calc(100dvh-var(--header-h)-3rem)] xl:self-start",
            panel !== "aside" && "max-xl:hidden",
          )}
        >
          {aside}
        </aside>
      </div>
    </div>
  );
}
