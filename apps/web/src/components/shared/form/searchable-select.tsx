"use client";

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
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
export interface SearchableSelectGroup {
  key: string;
  label?: string;
  options: SelectOption[];
}

interface SearchableSelectProps extends Omit<
  ComponentProps<typeof ComboboxTrigger>,
  "value" | "onValueChange" | "children"
> {
  options: SelectOption[];
  /** Renders the list under headings instead of flat. Leave unset for the plain picker. */
  groups?: SearchableSelectGroup[];
  /** The chosen option's `value`, or null for nothing chosen. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  icon?: ReactNode;
}

interface OptionGroupItems {
  value: string;
  label?: string;
  items: SelectOption[];
}

function renderOption(option: SelectOption) {
  return (
    <ComboboxItem key={option.value} value={option}>
      <span className="truncate">{option.label}</span>
    </ComboboxItem>
  );
}

export default function SearchableSelect({
  options,
  groups,
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

  const optionsByValue = new Map(options.map((option) => [option.value, option]));
  const items: SelectOption[] | OptionGroupItems[] = groups
    ? groups.map((group) => ({
        value: group.key,
        label: group.label,
        items: group.options.map((option) => optionsByValue.get(option.value) ?? option),
      }))
    : options;

  return (
    <Combobox
      items={items}
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
          {groups
            ? (group: OptionGroupItems) => (
                <ComboboxGroup key={group.value} items={group.items}>
                  {group.label ? <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel> : null}
                  <ComboboxCollection>{renderOption}</ComboboxCollection>
                </ComboboxGroup>
              )
            : renderOption}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
