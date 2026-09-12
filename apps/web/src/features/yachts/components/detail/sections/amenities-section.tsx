"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDown, CircleCheckBig, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { amenityIcon, groupIcon } from "../../../lib/amenity-icons";
import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * How many fittings the open groups may hold before the rest arrive collapsed.
 *
 * Every group used to be open and the section simply ran long: an ordinary boat lists a couple
 * of dozen amenities, but the fullest listing in the catalogue carries 117, which is sixty rows
 * of two columns under six headings. The budget is counted in fittings rather than groups so a
 * boat with two dozen opens whole -- which is the design as drawn -- and only the outliers fold.
 */
const OPEN_BUDGET = 28;

type Amenity = NonNullable<
  ReturnType<typeof useListingDetail>["data"]
>["includedAmenities"][number];

type AmenityRun = { group: Amenity["group"]; amenities: Amenity[] };

/*
 * The list arrives already ordered by group -- the read model sorts on the heading before it
 * sorts on the curated rank -- so consecutive runs are all this has to find. Grouping by a map
 * instead would work equally well until a future caller sends an unsorted list, and then it
 * would silently reorder the page rather than showing the seam.
 */
function runsByGroup(amenities: readonly Amenity[]): AmenityRun[] {
  const runs: AmenityRun[] = [];
  for (const amenity of amenities) {
    const current = runs.at(-1);
    if (current?.group === amenity.group) current.amenities.push(amenity);
    else runs.push({ group: amenity.group, amenities: [amenity] });
  }
  return runs;
}

/** The groups that start collapsed: the ones past the budget, in order. */
function initiallyClosed(runs: readonly AmenityRun[]): string[] {
  let remaining = OPEN_BUDGET;
  const closed: string[] = [];
  for (const run of runs) {
    if (remaining <= 0) closed.push(run.group);
    remaining -= run.amenities.length;
  }
  return closed;
}

/*
 * A break opportunity after each slash.
 *
 * Both vendors join two names with a bare slash -- "Echosounder/Depthsounder", "Wind
 * instrument/Anemometer" -- and a browser does not treat that as a place it may wrap outside a
 * URL. In a half-width column the label then ran under the "Included" mark beside it. The
 * fallback `wrap-break-word` still catches a single long word, but it breaks mid-syllable, so
 * the slash is offered first.
 */
function breakableLabel(label: string) {
  return label.split("/").map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index > 0 && (
        <>
          {"/"}
          <wbr />
        </>
      )}
      {part}
    </Fragment>
  ));
}

export default function AmenitiesSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();
  const runs = runsByGroup(data?.includedAmenities ?? []);
  const [closed, setClosed] = useState<string[]>(() => initiallyClosed(runs));
  const [noteDismissed, setNoteDismissed] = useState(false);

  if (!data) return null;

  return (
    <DetailSection id="amenities" title={t("sections.amenities")}>
      <div className="flex flex-col gap-3">
        {runs.map((run) => {
          const GroupIcon = groupIcon(run.group);
          const isOpen = !closed.includes(run.group);

          return (
            <section
              key={run.group}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setClosed((state) =>
                    isOpen ? [...state, run.group] : state.filter((group) => group !== run.group),
                  )
                }
                className="flex w-full items-center gap-3 bg-brand-50 px-4 py-3 text-left transition-colors hover:bg-brand-100/60"
              >
                <GroupIcon className="size-5 shrink-0 text-brand" />
                <h3 className="min-w-0 flex-1 text-base leading-6 font-semibold text-foreground">
                  {t(`amenities.groups.${run.group}`)}
                </h3>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t("amenities.itemCount", { count: run.amenities.length })}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <div className="grid gap-x-10 px-4 py-1 md:grid-cols-2">
                  {run.amenities.map((amenity) => {
                    const Icon = amenityIcon(amenity.icon, run.group);

                    return (
                      <div
                        key={amenity.code}
                        className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-b-0 md:nth-last-2:odd:border-b-0"
                      >
                        <Icon className="size-4.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 text-base wrap-break-word text-foreground">
                          {breakableLabel(amenity.label)}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <CircleCheckBig className="size-4.5 shrink-0 text-brand" />
                          <span className="text-sm font-medium text-muted-foreground">
                            {t("included")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {!noteDismissed && runs.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5">
          <Info className="size-4 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-sm text-foreground">{t("amenities.allIncluded")}</p>
          <button
            type="button"
            aria-label={t("amenities.dismissNote")}
            onClick={() => setNoteDismissed(true)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-brand-100/60 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </DetailSection>
  );
}
