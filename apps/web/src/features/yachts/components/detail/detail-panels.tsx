"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

const PANELS = ["details", "booking"] as const;

/*
 * Below xl the design (Figma 968:57728 tablet, 967:75492 mobile) splits the page into two segmented
 * tabs — the yacht itself and the booking card — because the 334px column has nowhere to sit. From
 * xl both fit side by side, so the bar disappears and the panels become the grid columns; the
 * panels stay in one DOM tree so the section anchors and the in-page tabs keep working.
 */
export default function DetailPanels({
  details,
  booking,
}: {
  details: ReactNode;
  booking: ReactNode;
}) {
  const t = useTranslations("YachtDetail");
  const [panel, setPanel] = useState<(typeof PANELS)[number]>(PANELS[0]);

  return (
    <div className="mx-auto flex w-full max-w-349 flex-col gap-6 md:gap-8">
      <Tabs
        variant="segmented"
        value={panel}
        onValueChange={(value) => setPanel(value as (typeof PANELS)[number])}
        className="xl:hidden"
      >
        {/* Figma draws both strokes inside its 66px bar, so the tab padding absorbs the two
            borders the box model adds on top — otherwise the whole page below sits 4px low. */}
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

        {/* The card is ~2050px against a ~900px viewport, so it is capped to the screen and
            scrolls internally — a plain sticky would pin it and leave the CTAs unreachable.
            The cap subtracts the header stack (nav + breadcrumb bar + page padding) on top of the
            sticky gap, so the card also fits before it pins at the very top of the page. Below xl
            the card owns the whole tab, so it grows freely instead. */}
        <aside
          className={cn(
            "flex xl:sticky xl:top-6 xl:max-h-[calc(100dvh-12rem)] xl:self-start",
            panel !== "booking" && "max-xl:hidden",
          )}
        >
          {booking}
        </aside>
      </div>
    </div>
  );
}
