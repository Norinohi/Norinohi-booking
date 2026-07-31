"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Accordion } from "@yacht-charter/ui/components/layout/accordion";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { cn } from "@yacht-charter/ui/lib/utils";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { countActiveFilters, DEFAULT_FILTERS, type FiltersState } from "../lib/state";
import { useDraft } from "../hooks/use-draft";
import AdditionalSection from "./sections/additional-section";
import BoatSection from "./sections/boat-section";
import RatingsSection from "./sections/ratings-section";
import SpecsSection from "./sections/specs-section";
import WhenSection from "./sections/when-section";
import WhereSection from "./sections/where-section";

const SECTIONS = ["where", "when", "boat", "specs", "additional", "ratings"];

export type FiltersPanelProps = {
  value: FiltersState;
  onApply: (next: FiltersState) => void;
  className?: string;
  scrollable?: boolean;
  /** Adds a close control to the header; omit where the panel is always on screen. */
  onClose?: () => void;
};

export default function FiltersPanel({
  value,
  onApply,
  className,
  scrollable = false,
  onClose,
}: FiltersPanelProps) {
  const t = useTranslations("Filters");
  const [draft, setDraft] = useDraft(value);
  const draftCount = countActiveFilters(draft);

  function set<K extends keyof FiltersState>(key: K, next: FiltersState[K]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onApply(draft);
  }

  const sectionProps = { value: draft, set };

  const body = (
    <>
      <Accordion defaultValue={SECTIONS}>
        <WhereSection {...sectionProps} />
        <WhenSection {...sectionProps} />
        <BoatSection {...sectionProps} />
        <SpecsSection {...sectionProps} />
        <AdditionalSection {...sectionProps} />
        <RatingsSection {...sectionProps} />
      </Accordion>

      <div className="flex flex-col items-center justify-center gap-2 bg-natural-50 p-4">
        <p className="w-full text-center text-xl font-bold leading-[1.3] text-foreground">
          {t("needHelp")}
        </p>
        <button
          type="button"
          className="w-full rounded-lg px-1 py-1.5 font-bold leading-[1.4] text-natural-500 underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {t("contactExpert")}
        </button>
      </div>
    </>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border p-4">
        <h2 className="flex-1 text-xl font-bold leading-[1.3] text-natural-700">
          {t("title", { count: draftCount })}
        </h2>
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_FILTERS)}
          className="rounded-lg px-1 py-1.5 leading-[1.4] font-bold underline underline-offset-2 outline-none hover:text-natural-500 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {t("clearAll")}
        </button>
        {onClose ? (
          <IconButton variant="subtle" size="sm" aria-label={t("close")} onClick={onClose}>
            <X />
          </IconButton>
        ) : null}
      </div>

      {scrollable ? <ScrollArea className="min-h-0 flex-1">{body}</ScrollArea> : body}

      <div className="shrink-0 border-t border-border bg-background p-4 shadow-[4px_-4px_10px_rgba(0,0,0,0.1)]">
        <Button type="submit" variant="brand" size="md" className="w-full capitalize">
          {t("apply", { count: draftCount })}
        </Button>
      </div>
    </form>
  );
}
