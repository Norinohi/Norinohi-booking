"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { cn } from "@yacht-charter/ui/lib/utils";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { useFillToFold } from "@/hooks/use-fill-to-fold";

const PANELS = ["main", "aside"] as const;

type Panel = (typeof PANELS)[number];

interface SplitPanelsProps {
  /** Tab labels below `xl`, where the two panels share the screen. */
  labels: Record<Panel, ReactNode>;
  main: ReactNode;
  aside: ReactNode;
}

export default function SplitPanels({ labels, main, aside }: SplitPanelsProps) {
  const [panel, setPanel] = useState<Panel>(PANELS[0]);
  const asideRef = useFillToFold<HTMLElement>("xl");
  const rootRef = useRef<HTMLDivElement>(null);
  const returnToTop = useRef(false);

  /* Only one panel shows below `xl`, so the scroll offset belongs to the panel being left.
     Kept as is, it lands deep inside the shorter panel, or past it in the footer. */
  const selectPanel = (next: Panel) => {
    const root = rootRef.current;
    returnToTop.current =
      root !== null &&
      root.getBoundingClientRect().top < Number.parseFloat(getComputedStyle(root).scrollMarginTop);
    setPanel(next);
  };

  /* After the swap, so the page it scrolls is the one the new panel produced. */
  useLayoutEffect(() => {
    if (!returnToTop.current) return;
    returnToTop.current = false;
    rootRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [panel]);

  return (
    <div
      ref={rootRef}
      className="mx-auto flex w-full max-w-349 scroll-mt-(--header-h) flex-col gap-6 md:gap-8"
    >
      <Tabs
        variant="segmented"
        value={panel}
        onValueChange={(value) => selectPanel(PANELS.find((id) => id === value) ?? PANELS[0])}
        className="sticky top-(--header-h) z-20 bg-background xl:hidden"
      >
        <TabsList className="items-stretch">
          {PANELS.map((id) => (
            <TabsTab
              key={id}
              value={id}
              className="min-w-0 flex-1 px-2 py-3.5 leading-5.5 wrap-break-word whitespace-normal"
            >
              {labels[id]}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_--spacing(83.5)]">
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
