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
const KIND_ICON: Record<Suggestion["kind"], ReactNode> = {
  country: <Globe className="size-5 shrink-0 text-natural-400" />,
  region: <MapIcon className="size-5 shrink-0 text-natural-400" />,
  location: <MapPin className="size-5 shrink-0 text-natural-400" />,
  base: <Anchor className="size-5 shrink-0 text-natural-400" />,
};

/*
 * The search bar's Location field: a searchable single-select (same mechanism as the other search
 * fields). The trigger shows the chosen destination; the popup holds the search, which drives
 * `charterSearch.suggestions`. Picking a suggestion sets the `query` filter, matched server-side
 * against country/region/location/base.
 */
export default function LocationSearch({
  value,
  onValueChange,
  placeholder,
}: {
  value: string;
  onValueChange: (next: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("Yachts.searchBar");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const { data } = useQuery(suggestionsQueryOptions(debounced));
  const items = data ?? [];

  return (
    <Combobox
      items={items}
      filter={null}
      value={null}
      onValueChange={(item: Suggestion | null) => onValueChange(item?.label ?? "")}
      inputValue={search}
      onInputValueChange={(next) => setSearch(next)}
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
      itemToStringLabel={(item: Suggestion) => item.label}
    >
      <ComboboxTrigger
        icon={<MapPin className="size-6 shrink-0 text-foreground" />}
        onClear={value ? () => onValueChange("") : undefined}
        clearLabel={t("clearLocation")}
      >
        {value || <span className="text-placeholder-foreground">{placeholder}</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch placeholder={t("startTyping")} />
        <ComboboxEmpty>{debounced.trim().length >= 1 ? t("noLocations") : ""}</ComboboxEmpty>
        <ComboboxList>
          {(item: Suggestion) => (
            <ComboboxItem key={item.label} value={item}>
              {KIND_ICON[item.kind]}
              <span className="truncate">{item.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
