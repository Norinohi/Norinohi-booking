"use client";

import { Combobox } from "@base-ui/react/combobox";
import { cn } from "@yacht-charter/ui/lib/utils";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FieldClear } from "@yacht-charter/ui/components/form/field-clear";
import { useUiLabels } from "@yacht-charter/ui/components/ui-labels";

/*
 * MultiSelect — checkbox picker built on base-ui Combobox (`multiple`), so the
 * searchable and plain variants share one primitive: passing `searchPlaceholder`
 * mounts the in-popup filter field. An empty selection means "no constraint" and
 * shows `placeholder`; otherwise the trigger lists the chosen labels.
 * Box + tick match the Checkbox primitive: 24px, 4px radius, brand fill when set.
 */
export type MultiSelectOption = { value: string; label: string };

export type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  /** Shown when the filter matches nothing; falls back to `UiLabelsProvider`. */
  emptyMessage?: string;
  icon?: ReactNode;
  /** Shows a reset button once something is selected. */
  clearable?: boolean;
  /** Accessible name of the reset button; falls back to `UiLabelsProvider` with `placeholder`. */
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
};

function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  icon,
  clearable = true,
  clearLabel,
  disabled,
  className,
  contentClassName,
}: MultiSelectProps) {
  const uiLabels = useUiLabels();
  const labels = new Map(options.map((option) => [option.value, option.label]));
  const selected = value.filter((item) => labels.has(item));
  const showClear = clearable && selected.length > 0 && !disabled;

  return (
    <Combobox.Root
      multiple
      disabled={disabled}
      items={options.map((option) => option.value)}
      value={selected}
      onValueChange={(next) => onValueChange(next)}
      itemToStringLabel={(item) => labels.get(item) ?? item}
    >
      <div className="relative">
        <Combobox.Trigger
          data-slot="multi-select-trigger"
          className={cn(
            "group flex h-12 w-full min-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none",
            "hover:border-natural-200 data-[popup-open]:border-foreground",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
            /* `FormControl` sets aria-invalid; it has to beat hover/open/focus too. */
            "aria-invalid:border-error-600 aria-invalid:hover:border-error-600 aria-invalid:data-[popup-open]:border-error-600 aria-invalid:focus-visible:border-error-600 aria-invalid:focus-visible:ring-error-600/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("flex min-w-0 flex-1 items-center gap-2", showClear && "pr-6")}>
            {icon}
            <span
              className={cn("truncate", selected.length === 0 && "text-placeholder-foreground")}
            >
              {selected.length === 0
                ? placeholder
                : selected.map((item) => labels.get(item)).join(", ")}
            </span>
          </span>
          <Combobox.Icon className="flex size-6 shrink-0 items-center justify-center text-foreground">
            <ChevronDownIcon className="size-5 transition-transform group-data-[popup-open]:rotate-180" />
          </Combobox.Icon>
        </Combobox.Trigger>

        {showClear ? (
          <FieldClear
            label={clearLabel ?? uiLabels.clear(placeholder)}
            onClear={() => onValueChange([])}
          />
        ) : null}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" className="z-50 outline-none">
          <Combobox.Popup
            data-slot="multi-select-content"
            className={cn(
              "flex max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg border border-input bg-popover text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] outline-none",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              contentClassName,
            )}
          >
            {searchPlaceholder ? (
              <div className="shrink-0 p-2">
                <div className="flex h-12 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring">
                  <SearchIcon className="size-6 shrink-0 text-foreground" />
                  <Combobox.Input
                    placeholder={searchPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-placeholder-foreground"
                  />
                </div>
              </div>
            ) : null}

            <Combobox.Empty className="px-4 py-3 text-base text-natural-500 empty:m-0 empty:p-0">
              {emptyMessage ?? uiLabels.noMatches}
            </Combobox.Empty>

            <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="group flex cursor-pointer items-center gap-3 border-t border-natural-50 px-4 py-3 text-base text-foreground outline-none first:border-t-0 data-highlighted:bg-natural-50"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border-[1.2px] border-input transition-colors group-data-[selected]:border-brand group-data-[selected]:bg-brand group-data-[selected]:text-brand-foreground">
                    <Combobox.ItemIndicator className="grid place-content-center text-current">
                      <CheckIcon strokeWidth={2.5} className="size-[18px]" />
                    </Combobox.ItemIndicator>
                  </span>
                  <span className="truncate">{labels.get(item) ?? item}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export { MultiSelect };
