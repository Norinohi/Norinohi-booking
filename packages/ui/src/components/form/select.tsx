"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { FieldClear } from "@yacht-charter/ui/components/form/field-clear";
import { cn } from "@yacht-charter/ui/lib/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

/*
 * Select — Figma "Selector" (nodes 733:9616 default / 755:19517 opened), Inputs & Selection.
 * The trigger mirrors the Text field: 1px natural-100 border, 8px radius, 12px padding, 16px
 * placeholder in natural-300, 24px chevron that flips up when open. The popup is a white card
 * with a 1px border and a 4/4/10 shadow; items are 14 SemiBold rows that turn brand when active.
 *
 * `SelectRoot` + the parts are the primitives for custom composition; `Select` (below) is the
 * assembled single-select for the common case — pass it an options list and it wires the trigger,
 * label resolution, and the async popup states for you.
 */
const SelectRoot = SelectPrimitive.Root;

export type SelectOption = { value: string; label: string };

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn(
        "min-w-0 truncate text-base data-[placeholder]:text-placeholder-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `clearable` shows a reset button once `onClear` is supplied; the trigger is a
 * `<button>`, so the control is layered over it rather than nested inside — see
 * `FieldClear`. Unlike MultiSelect this defaults to `false`: an empty array is
 * always a valid multi-selection, but a single select usually must hold a value.
 */
function SelectTrigger({
  className,
  children,
  clearable = false,
  onClear,
  clearLabel = "Clear selection",
  ...props
}: SelectPrimitive.Trigger.Props & {
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const showClear = clearable && Boolean(onClear) && !props.disabled;

  // No width of its own — as a block it fills a column, and in a flex row it
  // shrinks to the trigger, so the caller's sizing classes still decide.
  return (
    <div className="relative">
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        className={cn(
          "group flex w-full min-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none",
          "hover:border-natural-200 data-[popup-open]:border-foreground",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          /* `FormControl` sets aria-invalid; it has to beat hover/open/focus too. */
          "aria-invalid:border-error-600 aria-invalid:hover:border-error-600 aria-invalid:data-[popup-open]:border-error-600 aria-invalid:focus-visible:border-error-600 aria-invalid:focus-visible:ring-error-600/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          showClear && "[&>[data-slot=select-value]]:pr-6",
          className,
        )}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon className="flex size-6 shrink-0 items-center justify-center text-foreground">
          <ChevronDownIcon className="size-5 transition-transform group-data-[popup-open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      {showClear && onClear ? <FieldClear label={clearLabel} onClear={onClear} /> : null}
    </div>
  );
}

function SelectContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-input bg-popover px-4 py-3 text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 border-b border-natural-50 py-2 text-sm font-semibold text-foreground capitalize outline-none select-none last:border-b-0",
        "data-[highlighted]:text-brand data-[selected]:text-brand",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="flex shrink-0 text-brand">
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

const LOADING_ROWS = 4;

function optionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Assembled single-select over an options list. The trigger resolves the selected value to its
 * label with a render function (items live in a closed portal, so Base UI's own resolution falls
 * back to the raw value), and the popup owns the async lifecycle: Skeleton rows while `isLoading`,
 * a muted `emptyLabel` when the resolved list is empty, items otherwise. `renderValue` overrides
 * the trigger display for cases like a "Sort: X" prefix. Texts are props — this package has no i18n.
 */
function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  icon,
  isLoading = false,
  emptyLabel = "No options",
  clearable = false,
  onClear,
  clearLabel,
  renderValue,
  className,
  ariaLabel,
  disabled,
}: {
  options: SelectOption[];
  /** Controlled value; pair with `onValueChange`. Omit both and pass `defaultValue` for uncontrolled. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  isLoading?: boolean;
  emptyLabel?: string;
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  renderValue?: (value: string) => ReactNode;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <SelectRoot
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as string)}
      disabled={disabled}
    >
      <SelectTrigger
        className={className}
        /*
         * A `role="combobox"` takes its accessible name from aria-label, never from its content —
         * the text inside is the *value*, not the name. Without this the trigger is an unnamed
         * button to a screen reader (and fails Lighthouse's button-name audit). Falling back to
         * the placeholder gives every select a name; pass `ariaLabel` explicitly wherever a
         * visible label exists or the placeholder is uninformative.
         */
        aria-label={ariaLabel ?? placeholder}
        clearable={clearable}
        onClear={onClear}
        clearLabel={clearLabel}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <SelectValue placeholder={placeholder}>
            {(current) =>
              current
                ? (renderValue?.(current as string) ?? optionLabel(options, current as string))
                : placeholder
            }
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <div aria-busy="true" className="flex flex-col gap-2 py-1">
            {Array.from({ length: LOADING_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-5 w-full rounded-sm" />
            ))}
          </div>
        ) : options.length === 0 ? (
          <p className="py-2 text-center text-sm font-medium text-natural-500">{emptyLabel}</p>
        ) : (
          options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </SelectRoot>
  );
}

export { Select, SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue };
