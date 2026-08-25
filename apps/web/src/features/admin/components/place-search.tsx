"use client";

import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { geocodePlaces, type GeocodeResult } from "@/lib/mapbox-geocode";

/*
 * Type a harbour, get its coordinates.
 *
 * The pin is still the authority — a picked result only moves it, and the author can drag it to
 * the anchorage rather than the town square. What this removes is the step where somebody looks
 * a place up elsewhere and copies two numbers across, which is where a transposed pair gets in.
 *
 * `proximity` is the route's own base, so "Vis" resolves to the Adriatic island rather than to
 * whichever larger place shares the name.
 */

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

export default function PlaceSearch({
  proximity,
  onPick,
}: {
  proximity: { lat: number; lng: number } | null;
  onPick: (place: GeocodeResult) => void;
}) {
  const t = useTranslations("Admin.Routes.stops.search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      geocodePlaces(trimmed, { signal: controller.signal, proximity: proximity ?? undefined })
        .then(setResults)
        /* An aborted request is the next keystroke arriving, not a failure to report. */
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [query, proximity]);

  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        fieldClassName="h-12"
        label={t("label")}
        value={query}
        startIcon={<Search />}
        placeholder={t("placeholder")}
        supportingText={t("hint")}
        onChange={(event) => setQuery(event.target.value)}
      />

      {searching && results.length === 0 ? (
        <p className="text-sm text-natural-500">{t("searching")}</p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex max-h-44 flex-col overflow-y-auto rounded-lg border border-natural-100">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(place);
                  setResults([]);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left outline-none transition-colors hover:bg-natural-50 focus-visible:bg-natural-50"
              >
                <span className="text-base font-medium text-foreground">{place.name}</span>
                <span className="text-sm text-natural-500">{place.context}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
