"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@yacht-charter/ui/components/form/combobox";
import { Anchor, Globe, Map as MapIcon, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { type Suggestion, suggestionsQueryOptions } from "../../api/queries";

/** Destination-kind glyphs, so a suggestion reads at a glance (country vs region vs marina). */
const KIND_ICON = {
  country: <Globe className="size-5 shrink-0 text-natural-400" />,
  region: <MapIcon className="size-5 shrink-0 text-natural-400" />,
  location: <MapPin className="size-5 shrink-0 text-natural-400" />,
  base: <Anchor className="size-5 shrink-0 text-natural-400" />,
} satisfies Record<Suggestion["kind"], ReactNode>;

/*
 * The search bar's Location field: a searchable single-select (same mechanism as the other search
 * fields). The trigger shows the chosen destination; the popup holds the search, which drives
 * `charterSearch.suggestions`.
 *
 * The whole suggestion leaves through `onSelect`, not just its label: which filter a destination
 * belongs in is decided by its `kind`, and that is the caller's business, not this control's.
 * `value` is the caller's rendering of what is currently selected.
 */
interface LocationSearchProps {
  value: string;
  onSelect: (next: Suggestion | null) => void;
  placeholder: string;
}

export default function LocationSearch({ value, onSelect, placeholder }: LocationSearchProps) {
  const t = useTranslations("Yachts.searchBar");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const { data } = useQuery(suggestionsQueryOptions(debounced));
  const items = data ?? [];
  /*
   * The empty field answers with the curated countries and marks every one of them; a typeahead
   * result is never marked. So the heading is a property of the whole list rather than of a run
   * inside it, and it renders above the list rather than as a base-ui Group -- a group would
   * have to partition items the server has already told us are all of one kind.
   */
  const showPopularHeading = items.length > 0 && items.every((item) => item.popular);

  return (
    <Combobox
      items={items}
      filter={null}
      value={null}
      onValueChange={(item: Suggestion | null) => onSelect(item)}
      inputValue={search}
      onInputValueChange={(next) => setSearch(next)}
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
      itemToStringLabel={(item: Suggestion) => item.label}
    >
      <ComboboxTrigger
        icon={<MapPin className="size-6 shrink-0 text-foreground" />}
        onClear={value ? () => onSelect(null) : undefined}
        clearLabel={t("clearLocation")}
      >
        {value || <span className="text-placeholder-foreground">{placeholder}</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch placeholder={t("startTyping")} />
        <ComboboxEmpty>{debounced.trim().length >= 1 ? t("noLocations") : ""}</ComboboxEmpty>
        {showPopularHeading ? (
          <div className="shrink-0 px-4 pt-3 pb-1 text-sm font-medium text-natural-500">
            {t("popularCountries")}
          </div>
        ) : null}
        <ComboboxList>
          {(item: Suggestion) => (
            <ComboboxItem key={`${item.kind}:${item.value}`} value={item}>
              {KIND_ICON[item.kind]}
              <span className="truncate">{item.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
