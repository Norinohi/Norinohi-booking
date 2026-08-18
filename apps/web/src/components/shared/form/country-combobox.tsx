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
import { useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";

import { useCountryOptions } from "@/hooks/use-country-options";

/**
 * A country field you can type into.
 *
 * The list is ~250 entries in the reader's own language, which is more than anyone
 * should scroll past to reach Croatia. Filtering is the combobox's own — the whole
 * list is local, so there is nothing to debounce and no `filter={null}`.
 *
 * The value is the ISO 3166-1 alpha-2 code, matching every country field on the API
 * side; the option object is an implementation detail of the combobox, resolved here
 * so callers keep handing a plain string back and forth.
 *
 * Extra props land on the trigger, which is what `FormControl` clones its `id` and
 * `aria-*` onto — including `aria-invalid`, which the trigger paints its error border
 * from.
 */
export default function CountryCombobox({
  value,
  onValueChange,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof ComboboxTrigger>, "value" | "onValueChange" | "children"> & {
  /** ISO 3166-1 alpha-2, or "" for nothing chosen. */
  value: string;
  onValueChange: (code: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("Common.countryPicker");
  const countries = useCountryOptions();
  const [search, setSearch] = useState("");

  const selected = countries.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={countries}
      value={selected}
      onValueChange={(option: SelectOption | null) => onValueChange(option?.value ?? "")}
      inputValue={search}
      onInputValueChange={setSearch}
      /* Cleared on close so reopening starts from the whole list rather than the
         last search, which would look like most countries had gone missing. */
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
      itemToStringLabel={(option: SelectOption) => option.label}
    >
      <ComboboxTrigger {...props}>
        {selected?.label ?? <span className="text-placeholder-foreground">{placeholder}</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch placeholder={t("search")} />
        <ComboboxEmpty>{t("empty")}</ComboboxEmpty>
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
