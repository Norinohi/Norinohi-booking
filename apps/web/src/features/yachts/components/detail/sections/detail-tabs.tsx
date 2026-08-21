"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";

const SECTIONS = [
  "overview",
  "amenities",
  "mandatory-extras",
  "optional-extras",
  "description",
  "important-info",
  "suggested-route",
  "review",
  "faq",
  "popular-yachts",
] as const;

function useActiveSection() {
  const [active, setActive] = useState<string>(SECTIONS[0]);

  useEffect(() => {
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = SECTIONS.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );

    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return [active, setActive] as const;
}

export default function DetailTabs() {
  const t = useTranslations("YachtDetail");
  const [active, setActive] = useActiveSection();
  const { data } = useListingDetail();

  /*
   * FAQ is the one section that can be absent: no provider publishes per-listing questions, so
   * `FaqSection` renders nothing without them. Its tab has to go with it — `goTo` no-ops on a
   * missing id, so the tab would look enabled and simply do nothing when pressed.
   */
  const sections = SECTIONS.filter((id) => id !== "faq" || (data?.faq.length ?? 0) > 0);

  function goTo(id: string) {
    setActive(id);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <Tabs
      variant="lined"
      value={active}
      onValueChange={(value) => {
        const next = SECTIONS.find((id) => id === value);
        if (next) goTo(next);
      }}
      /* Sticks a pixel high and pads it back, so the bar tucks under the chrome above instead of
         meeting it edge to edge, where a rounding seam can let the page show through. */
      className="sticky top-[calc(var(--header-h)+65px)] z-10 bg-background pt-px xl:top-[calc(var(--header-h)-1px)]"
    >
      <TabsList className="overflow-x-auto">
        {sections.map((id) => (
          <TabsTab key={id} value={id}>
            {t(`tabs.${id}`)}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
