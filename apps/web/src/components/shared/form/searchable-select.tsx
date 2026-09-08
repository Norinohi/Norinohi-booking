"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@yacht-charter/ui/components/form/combobox";
import type { SelectOption } from "@yacht-charter/ui/components/form/select";
import { type ComponentProps, type ReactNode, useState } from "react";

/**
 * A single-select you can type into, for a list too long to scroll.
 *
 * The plain `Select` is the right control up to a dozen options; past that the reader is hunting.
 * Filtering is the combobox's own, because every list this serves is already in memory — there is
 * nothing to debounce and no `filter={null}`.
 *
 * Extra props land on the trigger, which is what `FormControl` clones its `id` and `aria-*` onto,
 * `aria-invalid` included — the trigger paints its error border from that.
 */
interface SearchableSelectProps extends Omit<
  ComponentProps<typeof ComboboxTrigger>,
  "value" | "onValueChange" | "children"
> {
  options: SelectOption[];
  /** The chosen option's `value`, or null for nothing chosen. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  icon?: ReactNode;
}

export default function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  icon,
  ...props
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option: SelectOption | null) => onValueChange(option?.value ?? null)}
      inputValue={search}
      onInputValueChange={setSearch}
      /* Cleared on close so reopening starts from the whole list rather than the last search,
         which would look like most of the options had gone missing. */
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
      itemToStringLabel={(option: SelectOption) => option.label}
    >
      <ComboboxTrigger icon={icon} {...props}>
        {selected?.label ?? <span className="text-placeholder-foreground">{placeholder}</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch placeholder={searchPlaceholder} />
        <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
