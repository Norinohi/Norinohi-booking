"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { useFillToFold } from "@/hooks/use-fill-to-fold";

const PANELS = ["details", "booking"] as const;

export default function SplitPanels({
  details,
  booking,
}: {
  details: ReactNode;
  booking: ReactNode;
}) {
  const t = useTranslations("YachtDetail");
  const [panel, setPanel] = useState<(typeof PANELS)[number]>(PANELS[0]);
  const bookingRef = useFillToFold<HTMLElement>("80rem");

  return (
    <div className="mx-auto flex w-full max-w-349 flex-col gap-6 md:gap-8">
      <Tabs
        variant="segmented"
        value={panel}
        onValueChange={(value) => setPanel(value as (typeof PANELS)[number])}
        className="sticky top-(--header-h) z-20 bg-background xl:hidden"
      >
        <TabsList>
          {PANELS.map((id) => (
            <TabsTab key={id} value={id} className="flex-1 py-3.5 leading-5.5">
              {t(`panels.${id}`)}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_334px]">
        <div className={cn("flex min-w-0 flex-col gap-6", panel !== "details" && "max-xl:hidden")}>
          {details}
        </div>

        <aside
          ref={bookingRef}
          className={cn(
            "flex xl:sticky xl:top-[calc(var(--header-h)+1.5rem)] xl:max-h-[calc(100dvh-var(--header-h)-3rem)] xl:self-start",
            panel !== "booking" && "max-xl:hidden",
          )}
        >
          {booking}
        </aside>
      </div>
    </div>
  );
}
