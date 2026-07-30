"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
  const [open, setOpen] = useState(false);
  const appliedCount = countActiveFilters(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={variant}
            className={cn(
              "w-full capitalize md:w-auto md:self-start",
              variant === "neutral" &&
                "data-popup-open:border-natural-300 data-popup-open:bg-natural-100",
              className,
            )}
          />
        }
      >
        <Filter />
        {t("trigger", { count: appliedCount })}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
        className="w-(--anchor-width) overflow-hidden border-0 bg-transparent p-0 shadow-none md:w-[334px]"
      >
        <FiltersPanel
          scrollable
          className="min-h-0 flex-1"
          value={value}
          onApply={(next) => {
            onApply(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
