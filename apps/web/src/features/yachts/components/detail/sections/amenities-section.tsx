"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDown, CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * Six rows collapsed, whatever the column count is. The grid is one column on phones and two
 * from `md`, so the same six rows are six items on one and twelve on the other: the extra six
 * are rendered either way and hidden by a class, because deciding the count from the viewport
 * in JavaScript would have the server render one number and the client another.
 *
 * Headings do not count against the budget. They are three lines of a two-dozen-line list and
 * charging them against it would mean a boat with equipment in six groups showed one fitting
 * under each, which is a table of contents rather than a preview.
 */
const COLLAPSED_ROWS = 6;
const COLLAPSED_ON_DESKTOP = COLLAPSED_ROWS * 2;

type Amenity = NonNullable<
  ReturnType<typeof useListingDetail>["data"]
>["includedAmenities"][number];

/*
 * The list arrives already ordered by group -- the read model sorts on the heading before it
 * sorts on the curated rank -- so consecutive runs are all this has to find. Grouping by a map
 * instead would work equally well until a future caller sends an unsorted list, and then it
 * would silently reorder the page rather than showing the seam.
 */
type AmenityRun = { group: Amenity["group"]; amenities: Amenity[] };

function runsByGroup(amenities: readonly Amenity[]): AmenityRun[] {
  const runs: AmenityRun[] = [];
  for (const amenity of amenities) {
    const current = runs.at(-1);
    if (current?.group === amenity.group) current.amenities.push(amenity);
    else runs.push({ group: amenity.group, amenities: [amenity] });
  }
  return runs;
}

export default function AmenitiesSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const amenities = data.includedAmenities;
  const groups = runsByGroup(amenities);
  /*
   * Two columns fit twice as much, so a list of nine is already whole on a desktop and folded on
   * a phone. The button follows: always there when even the wide grid has to hide something,
   * phone-only when it does not, gone when six rows hold everything.
   */
  const foldable = amenities.length > COLLAPSED_ROWS;
  const foldableOnDesktop = amenities.length > COLLAPSED_ON_DESKTOP;

  /* Runs the index forward across headings, so the budget counts fittings and not sections. */
  let position = 0;

  return (
    <DetailSection id="amenities" title={t("sections.amenities")}>
      <div className="flex flex-col gap-7">
        {groups.map((run) => {
          const start = position;
          position += run.amenities.length;
          /* A heading whose every fitting is folded away goes with them, at each breakpoint
             separately: on a phone the third group is usually past the fold and on a desktop it
             is not, and one class per element is what keeps the two renders identical. */
          const headingHidden = !expanded && start >= COLLAPSED_ROWS;
          const headingHiddenOnDesktop = !expanded && start >= COLLAPSED_ON_DESKTOP;
          if (headingHidden && headingHiddenOnDesktop) return null;

          return (
            <div key={run.group}>
              <h3
                className={cn(
                  "mb-2 items-center gap-2 text-base leading-6 font-semibold text-foreground md:text-lg",
                  headingHidden ? "hidden md:flex" : "flex",
                )}
              >
                <span aria-hidden className="h-4.5 w-1 shrink-0 rounded-full bg-brand-200" />
                {t(`amenities.groups.${run.group}`)}
              </h3>
              <div className="grid gap-x-10 gap-y-3 md:grid-cols-2 md:gap-y-0">
                {run.amenities.map((amenity, offset) => {
                  const index = start + offset;
                  const hidden = !expanded && index >= COLLAPSED_ROWS;
                  const hiddenOnDesktop = !expanded && index >= COLLAPSED_ON_DESKTOP;
                  if (hidden && hiddenOnDesktop) return null;

                  return (
                    <div
                      key={amenity.code}
                      className={cn(
                        "items-center gap-2 border-b border-dashed border-border pt-2 pb-1.75 md:pt-3 md:pb-2.75",
                        hidden ? "hidden md:flex" : "flex",
                      )}
                    >
                      <span className="min-w-0 flex-1 text-base text-foreground">
                        {amenity.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-2 py-1">
                        <CircleCheckBig className="size-5 shrink-0 text-brand" />
                        <span className="text-sm font-semibold tracking-wide text-foreground">
                          {t("included")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {foldable && (
        <Button
          variant="ghost"
          className={cn(
            "mt-3 h-auto gap-1 px-0 text-base font-semibold text-brand hover:bg-transparent",
            !foldableOnDesktop && "md:hidden",
          )}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded
            ? t("amenities.showFewer")
            : t("amenities.showAll", { count: amenities.length })}
          <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
        </Button>
      )}
    </DetailSection>
  );
}
