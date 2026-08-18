"use client";

import { Combobox as Base } from "@base-ui/react/combobox";
import { FieldClear } from "@yacht-charter/ui/components/form/field-clear";
import { textFieldVariants } from "@yacht-charter/ui/components/form/text-field";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/*
 * Combobox — a single-select searchable dropdown on base-ui Combobox: a trigger opens a popup with
 * the search field inside it, so it reads as one family with MultiSelect (its `multiple` sibling).
 * Callers feeding server-filtered items pass `filter={null}` so the list shows exactly what they
 * provide, and control the search field with `inputValue` / `onInputValueChange`.
 */

const Combobox = Base.Root;

function ComboboxTrigger({
  icon,
  className,
  children,
  onClear,
  clearLabel = "Clear",
  ...props
}: ComponentProps<typeof Base.Trigger> & {
  icon?: ReactNode;
  /** Renders a reset button over the trigger; pass it only while there is a value to clear. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const trigger = (
    <Base.Trigger
      className={cn(
        "group flex h-12 w-full min-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none",
        "hover:border-natural-200 data-[popup-open]:border-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        /* `FormControl` sets aria-invalid; it has to beat hover/open/focus too. */
        "aria-invalid:border-error-600 aria-invalid:hover:border-error-600 aria-invalid:data-[popup-open]:border-error-600 aria-invalid:focus-visible:border-error-600 aria-invalid:focus-visible:ring-error-600/40",
        className,
      )}
      {...props}
    >
      <span className={cn("flex min-w-0 flex-1 items-center gap-2", onClear && "pr-6")}>
        {icon}
        <span className="truncate">{children}</span>
      </span>
      <Base.Icon className="flex size-6 shrink-0 items-center justify-center text-foreground">
        <ChevronDownIcon className="size-5 transition-transform group-data-[popup-open]:rotate-180" />
      </Base.Icon>
    </Base.Trigger>
  );

  if (!onClear) return trigger;

  return (
    <div className="relative">
      {trigger}
      <FieldClear label={clearLabel} onClear={onClear} />
    </div>
  );
}

function ComboboxContent({ className, children, ...props }: ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={6} align="start" className="z-50 outline-none">
        <Base.Popup
          className={cn(
            "flex max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg border border-input bg-popover text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] outline-none",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        >
          {children}
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

function ComboboxSearch({ className, ...props }: ComponentProps<typeof Base.Input>) {
  return (
    <div className="shrink-0 p-2">
      {/* The project's standard input field styling, so focus reads as a dark border, not a ring. */}
      <div className={textFieldVariants()}>
        <span data-slot="text-field-icon" className="flex shrink-0 items-center self-start">
          <SearchIcon />
        </span>
        <Base.Input
          className={cn(
            "min-w-0 flex-1 bg-transparent text-base leading-[1.4] text-foreground outline-none placeholder:text-placeholder-foreground",
            className,
          )}
          {...props}
        />
      </div>
    </div>
  );
}

function ComboboxEmpty({ className, ...props }: ComponentProps<typeof Base.Empty>) {
  return (
    <Base.Empty
      className={cn("px-4 py-3 text-base text-natural-500 empty:m-0 empty:p-0", className)}
      {...props}
    />
  );
}

function ComboboxList({ className, ...props }: ComponentProps<typeof Base.List>) {
  return (
    <Base.List
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, ...props }: ComponentProps<typeof Base.Item>) {
  return (
    <Base.Item
      className={cn(
        "flex cursor-pointer items-center gap-3 border-t border-natural-50 px-4 py-3 text-base text-foreground outline-none first:border-t-0 data-highlighted:bg-natural-50 data-[selected]:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
};
