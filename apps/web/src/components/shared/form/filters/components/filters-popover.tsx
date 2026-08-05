"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Dialog, DialogContent, DialogTrigger } from "@yacht-charter/ui/components/overlay/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useFilterRanges } from "../hooks/use-filter-ranges";
import { countActiveFilters, type FiltersState } from "../lib/state";
import FiltersPanel from "./filters-panel";

export type FiltersPopoverProps = {
  value: FiltersState;
  onApply: (next: FiltersState) => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
};

export default function FiltersPopover({
  value,
  onApply,
  variant = "neutral",
  className,
}: FiltersPopoverProps) {
  const t = useTranslations("Filters");
  const { defaults } = useFilterRanges();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const appliedCount = countActiveFilters(value, defaults);

  const trigger = (visibility: string) => (
    <Button
      variant={variant}
      className={cn(
        "w-full capitalize md:w-auto md:self-start",
        variant === "neutral" &&
          "data-popup-open:border-natural-300 data-popup-open:bg-natural-100",
        className,
        visibility,
      )}
    />
  );

  const label = (
    <>
      <Filter />
      {t("trigger", { count: appliedCount })}
    </>
  );

  const panel = (close: () => void) => (
    <FiltersPanel
      scrollable
      className="min-h-0 flex-1"
      value={value}
      onClose={close}
      onApply={(next) => {
        onApply(next);
        close();
      }}
    />
  );

  return (
    <>
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogTrigger render={trigger("md:hidden")}>{label}</DialogTrigger>
        <DialogContent className="inset-4 top-4 left-4 h-auto w-auto max-w-none translate-x-0 translate-y-0 items-stretch gap-0 rounded-2xl p-0">
          {panel(() => setSheetOpen(false))}
        </DialogContent>
      </Dialog>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger render={trigger("hidden md:inline-flex")}>{label}</PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className="h-(--available-height) w-(--anchor-width) overflow-hidden border-0 bg-transparent p-0 shadow-none md:w-83.5"
        >
          {panel(() => setPopoverOpen(false))}
        </PopoverContent>
      </Popover>
    </>
  );
}
