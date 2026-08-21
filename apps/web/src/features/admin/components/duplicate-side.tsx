"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/data-display/image";

import type { ComparisonRow } from "../lib/duplicates";
import { type DuplicateSide as Side, toProviderKey } from "../types";

/*
 * DuplicateSide — one half of a duplicate pair: its image, title and provider chip over the
 * comparison rows, then the "keep this listing" affordance that names the survivor.
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

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-natural-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm leading-[1.3] font-semibold text-natural-500">
          {which === "a" ? t("sideA") : t("sideB")}
        </span>
        <Chip variant="neutral">{providerKey ? tProviders(providerKey) : side.provider}</Chip>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-natural-50">
        {listing?.primaryImageUrl ? (
          <Image
            fill
            src={listing.primaryImageUrl}
            alt={listing.title}
            sizes="(min-width: 1024px) 400px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-natural-500">
            <ImageOff className="size-6" />
            <span className="text-sm font-medium">{t("noImage")}</span>
          </div>
        )}
      </div>

      {listing ? (
        <h3 className="truncate text-base leading-[1.3] font-bold text-foreground">
          {listing.title}
        </h3>
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
