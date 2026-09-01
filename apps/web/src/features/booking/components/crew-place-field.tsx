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
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";

import { crewPlacesQueryOptions, type CrewPlace } from "../api/queries";

/**
 * A place the operator's crew list will accept, for the countries that insist on a known one.
 *
 * Croatia does — the vendor's own words are that a Croatian place of birth "must be one from
 * the list of known places" — and it validates nothing on the way in, so a freehand "Split"
 * is taken by the API and questioned at the desk. The list is 6,851 names and 360 KB, which is
 * why it is searched on the server and never shipped here: `filter={null}` tells the combobox
 * that what it was handed is already the answer.
 *
 * The label carries the municipality, because dozens of these names repeat across the country
 * and the town is the only thing that tells them apart.
 */
export default function CrewPlaceField({
  bookingId,
  value,
  onValueChange,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof ComboboxTrigger>, "value" | "onValueChange" | "children"> & {
  bookingId: string;
  value: string;
  onValueChange: (place: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("Booking.detail.crewList");
  const [search, setSearch] = useState("");

  const { data } = useQuery(crewPlacesQueryOptions(bookingId, search));
  const places = data?.places ?? [];
  /* The stored value is a name the customer already picked, so it stands alone as the label
     until the list comes back with the municipality it belongs to. */
  const selected =
    places.find((place) => place.name === value) ?? (value ? { name: value, label: value } : null);

  return (
    <Combobox
      items={places}
      filter={null}
      value={selected}
      onValueChange={(place: CrewPlace | null) => onValueChange(place?.name ?? "")}
      inputValue={search}
      onInputValueChange={setSearch}
      onOpenChange={(open) => {
        if (!open) setSearch("");
      }}
      itemToStringLabel={(place: CrewPlace) => place.label}
    >
      <ComboboxTrigger {...props}>
        {selected?.label ?? <span className="text-placeholder-foreground">{placeholder}</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch placeholder={t("placeSearch")} />
        <ComboboxEmpty>{t("placeEmpty")}</ComboboxEmpty>
        <ComboboxList>
          {(place: CrewPlace) => (
            <ComboboxItem key={place.name} value={place}>
              <span className="truncate">{place.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
