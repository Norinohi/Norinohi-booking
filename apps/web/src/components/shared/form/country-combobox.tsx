"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import SearchableSelect from "@/components/shared/form/searchable-select";
import { useCountryOptions } from "@/hooks/use-country-options";

/**
 * A country field you can type into.
 *
 * The list is ~250 entries in the reader's own language, which is more than anyone
 * should scroll past to reach Croatia.
 *
 * The value is the ISO 3166-1 alpha-2 code, matching every country field on the API
 * side; `SearchableSelect` speaks `string | null` because most of its lists have no
 * "nothing chosen" value at all, so the empty string is translated here rather than
 * pushed onto every other caller.
 *
 * Extra props land on the trigger, which is what `FormControl` clones its `id` and
 * `aria-*` onto — including `aria-invalid`, which the trigger paints its error border
 * from.
 */
interface CountryComboboxProps extends Omit<
  ComponentProps<typeof SearchableSelect>,
  "value" | "onValueChange" | "options" | "searchPlaceholder" | "emptyLabel"
> {
  /** ISO 3166-1 alpha-2, or "" for nothing chosen. */
  value: string;
  onValueChange: (code: string) => void;
  placeholder: string;
}

export default function CountryCombobox({
  value,
  onValueChange,
  placeholder,
  ...props
}: CountryComboboxProps) {
  const t = useTranslations("Common.countryPicker");
  const countries = useCountryOptions();

  return (
    <SearchableSelect
      options={countries}
      value={value === "" ? null : value}
      onValueChange={(code) => onValueChange(code ?? "")}
      placeholder={placeholder}
      searchPlaceholder={t("search")}
      emptyLabel={t("empty")}
      {...props}
    />
  );
}
