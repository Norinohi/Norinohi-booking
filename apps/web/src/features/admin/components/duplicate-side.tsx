"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import type { ComparisonRow } from "../lib/duplicates";
import { type DuplicateSide as Side, toProviderKey } from "../types";
import DuplicatePhotos from "./duplicate-photos";

/*
 * DuplicateSide — one half of a duplicate pair: its photos, title and provider chip over the
 * comparison rows, then the "keep this listing" affordance that names the survivor. The photos
 * are a carousel from the first render rather than a cover shot: a pair is usually settled by
 * looking at the boats, and making that a second click made every review two.
 * Both panels render the same rows in the same order at the same fixed row height, so the
 * highlighted mismatches line up across the gap and read as a single table.
 * A side whose listing was deleted after the pair was proposed renders as unavailable and
 * cannot be kept; the pair is still rejectable.
 */

export default function DuplicateSide({
  which,
  side,
  rows,
  onKeep,
  keepPending,
  keepDisabled,
}: {
  which: "a" | "b";
  side: Side;
  rows: ComparisonRow[];
  /** Omitted for a resolved candidate, where there is nothing left to decide. */
  onKeep?: () => void;
  keepPending?: boolean;
  keepDisabled?: boolean;
}) {
  const t = useTranslations("Admin.Duplicates");
  const tProviders = useTranslations("Admin.providers");
  const listing = side.listing;
  /* A connector key this build ships gets its name; any other code is shown as stored. */
  const providerKey = toProviderKey(side.provider);

  /*
   * Only published listings exist publicly — the detail route reads the search read model —
   * so a draft or hidden side gets plain text rather than a link that 404s. A merged pair
   * needs no special case: confirming a merge repoints both sources at the surviving
   * listing, so after it both sides of the card already resolve to the merged one.
   */
  const openSlug = listing !== null && listing.status === "published" ? listing.slug : null;

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-natural-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm leading-[1.3] font-semibold text-natural-500">
          {which === "a" ? t("sideA") : t("sideB")}
        </span>
        <Chip variant="neutral">{providerKey ? tProviders(providerKey) : side.provider}</Chip>
      </div>

      <DuplicatePhotos photos={listing?.photos ?? []} title={listing?.title ?? ""} />

      {listing ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-base leading-[1.3] font-bold text-foreground">
            {openSlug === null ? (
              listing.title
            ) : (
              <Link
                href={`/yachts/${openSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                {listing.title}
              </Link>
            )}
          </h3>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <h3 className="text-base leading-[1.3] font-bold text-foreground">
            {t("unavailable.title")}
          </h3>
          <p className="text-sm leading-[1.3] font-medium text-natural-500">
            {t("unavailable.description")}
          </p>
        </div>
      )}

      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex h-9 items-center justify-between gap-3 border-b border-natural-50 px-2 last:border-b-0",
              row.differs && "bg-warning-50",
            )}
          >
            <dt className="shrink-0 text-sm leading-[1.3] font-medium text-natural-500">
              {t(`fields.${row.key}`)}
            </dt>
            <dd
              className={cn(
                "truncate text-sm leading-[1.3] font-semibold",
                row.differs ? "text-warning-600" : "text-foreground",
              )}
            >
              {which === "a" ? row.a : row.b}
              {row.differs ? <span className="sr-only"> ({t("differs")})</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {onKeep ? (
        <Button
          variant="brand"
          onClick={onKeep}
          disabled={keepDisabled || listing === null}
          className="w-full"
        >
          {keepPending ? t("keeping") : t("keep")}
        </Button>
      ) : null}
    </div>
  );
}
