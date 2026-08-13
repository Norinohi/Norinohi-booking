"use client";

import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
      className="sticky top-[calc(var(--header-h)+66px)] z-10 bg-background xl:top-(--header-h)"
    >
      <TabsList className="overflow-x-auto">
        {SECTIONS.map((id) => (
          <TabsTab key={id} value={id}>
            {t(`tabs.${id}`)}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
