"use client";

import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useGeographyOptions } from "../hooks/use-routes";

/*
 * Which base or which region a route is written for.
 *
 * `suggested_route` holds two nullable foreign keys and a check constraint saying exactly one of
 * them is set, so this is a choice of *which column*, not a pair of optional fields. The level
 * select is what makes that visible, and switching it clears whichever id was held. The input
 * schema enforces the same rule again and raises its error on `baseId`, which is what `error`
 * renders — the check constraint would only ever surface as an unlabelled 500.
 *
 * `base` has no country column — it reaches one through location -> region -> country — so the
 * country filter runs on the server and both lists arrive already narrowed. They also arrive
 * ordered by how many published listings sit behind them, which is the order the client is
 * authoring in: the busiest bases first.
 */

export type RouteTarget = { baseId: string | null; regionId: string | null };

type Level = "base" | "region";

export default function RouteTargetPicker({
  value,
  currentLabel,
  onChange,
  error,
}: {
  value: RouteTarget;
  /** What the route already targets, so an edit shows its base even when the list has not got it. */
  currentLabel?: string;
  onChange: (next: RouteTarget) => void;
  error?: string;
}) {
  const t = useTranslations("Admin.Routes.target");
  const [countryId, setCountryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /* Null means "follow the value" — an edit opens on the level the route already uses. */
  const [chosenLevel, setChosenLevel] = useState<Level | null>(null);
  const level: Level = chosenLevel ?? (value.regionId ? "region" : "base");

  const { data, isPending } = useGeographyOptions({
    countryId: countryId ?? undefined,
    query: search.trim() || undefined,
  });

  const baseOptions = (data?.bases ?? []).map((entry) => ({
    value: entry.id,
    label: t("baseOption", {
      base: entry.name,
      place: entry.locationName,
      count: entry.listingCount,
    }),
  }));

  const regionOptions = (data?.regions ?? []).map((entry) => ({
    value: entry.id,
    label: t("regionOption", {
      region: entry.name,
      country: entry.countryName,
      count: entry.listingCount,
    }),
  }));

  const options = level === "region" ? regionOptions : baseOptions;
  const selected = level === "region" ? value.regionId : value.baseId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row">
        <Select
          className="h-12 min-w-0 md:flex-1"
          ariaLabel={t("country")}
          placeholder={t("allCountries")}
          value={countryId}
          clearable={countryId !== null}
          onClear={() => setCountryId(null)}
          onValueChange={setCountryId}
          options={(data?.countries ?? []).map((entry) => ({
            value: entry.id,
            label: entry.name,
          }))}
        />
        <Select
          className="h-12 min-w-0 md:w-52"
          ariaLabel={t("level")}
          value={level}
          onValueChange={(next) => {
            setChosenLevel(next === "region" ? "region" : "base");
            onChange({ baseId: null, regionId: null });
          }}
          options={[
            { value: "base", label: t("levelBase") },
            { value: "region", label: t("levelRegion") },
          ]}
        />
      </div>

      <TextField
        fieldClassName="h-12"
        value={search}
        startIcon={<Search />}
        placeholder={level === "region" ? t("searchRegion") : t("searchBase")}
        onChange={(event) => setSearch(event.target.value)}
      />

      <Select
        className="h-12 min-w-0"
        ariaLabel={level === "region" ? t("region") : t("base")}
        placeholder={level === "region" ? t("chooseRegion") : t("chooseBase")}
        isLoading={isPending}
        emptyLabel={t("noMatches")}
        value={selected}
        /* The picked row may sit outside the 200 the server sent back — a search narrows the
           list, and the route's own base then vanishes from it. The stored label stands in. */
        renderValue={(picked) =>
          options.find((option) => option.value === picked)?.label ?? currentLabel ?? picked
        }
        onValueChange={(next) =>
          onChange(
            level === "region"
              ? { baseId: null, regionId: next }
              : { baseId: next, regionId: null },
          )
        }
        options={options}
      />

      <p className="text-sm leading-[1.4] text-natural-500">{t("hint")}</p>
      {error ? <p className="text-sm leading-[1.4] text-error-500">{error}</p> : null}
    </div>
  );
}
