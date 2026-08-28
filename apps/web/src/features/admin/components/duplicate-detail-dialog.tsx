"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";

import { useDuplicateDetail } from "../hooks/use-duplicates";
import { type DetailKey, type DetailRow, detailRows, EMPTY_VALUE } from "../lib/duplicates";
import type { DuplicateCandidate, DuplicateDetailListing, DuplicateSide } from "../types";
import DuplicatePhotos from "./duplicate-photos";

/*
 * DuplicateDetailDialog — the whole of both boats, side by side, over the queue.
 * A modal rather than an expander: the specs run long enough that inline they pushed
 * the next pair off the screen, and a reviewer opening one pair is not reading the
 * others. The photos come from the candidate the card already holds; only the long
 * tail of specs is fetched, and only while the dialog is open.
 */

export default function DuplicateDetailDialog({
  candidate,
  open,
  onOpenChange,
}: {
  candidate: DuplicateCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Duplicates");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[90dvh] w-[95vw] max-w-320 items-stretch overflow-y-auto"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-left">{t("detailTitle")}</DialogTitle>
          <DialogDescription className="text-left">{t("detailSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so the specs are fetched on the click and not before. */}
        {open ? <DuplicateDetailBody candidate={candidate} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DuplicateDetailBody({ candidate }: { candidate: DuplicateCandidate }) {
  const t = useTranslations("Admin.Duplicates");
  const format = useFormatter();
  const { data, isPending, isError } = useDuplicateDetail(candidate.id);

  const money = (amountMinor: number, currency: string | null): string =>
    currency === null
      ? String(amountMinor / 100)
      : format.number(amountMinor / 100, { style: "currency", currency });

  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  const value = (key: DetailKey, listing: DuplicateDetailListing): string => {
    switch (key) {
      case "category":
        return listing.categoryName ?? EMPTY_VALUE;
      case "builder":
        return listing.builderName ?? EMPTY_VALUE;
      case "crewType":
        return listing.crewType ?? EMPTY_VALUE;
      case "beam":
        return listing.beamM === null ? EMPTY_VALUE : t("lengthValue", { value: listing.beamM });
      case "draft":
        return listing.draftM === null ? EMPTY_VALUE : t("lengthValue", { value: listing.draftM });
      case "heads":
        return listing.heads === null ? EMPTY_VALUE : String(listing.heads);
      case "showers":
        return listing.showers === null ? EMPTY_VALUE : String(listing.showers);
      case "engines":
        return listing.engines === null ? EMPTY_VALUE : String(listing.engines);
      case "enginePower":
        return listing.enginePower ?? EMPTY_VALUE;
      case "fuelType":
        return listing.fuelType ?? EMPTY_VALUE;
      case "fuelCapacity":
        return listing.fuelCapacity === null
          ? EMPTY_VALUE
          : t("litresValue", { value: listing.fuelCapacity });
      case "waterCapacity":
        return listing.waterCapacity === null
          ? EMPTY_VALUE
          : t("litresValue", { value: listing.waterCapacity });
      case "propulsion":
        return listing.propulsionType ?? EMPTY_VALUE;
      case "steering":
        return listing.steeringType ?? EMPTY_VALUE;
      case "sail":
        return listing.sailType ?? EMPTY_VALUE;
      case "deposit":
        return listing.securityDepositMinor === null
          ? EMPTY_VALUE
          : money(
              listing.securityDepositMinor,
              listing.securityDepositCurrency ?? listing.defaultCurrency,
            );
      case "depositInsurance":
        return t(listing.depositInsuranceIncluded ? "yes" : "no");
      case "pets":
        return t(listing.petsAllowed ? "yes" : "no");
      case "currency":
        return listing.defaultCurrency ?? EMPTY_VALUE;
      case "rating":
        return listing.providerRating === null
          ? EMPTY_VALUE
          : format.number(listing.providerRating);
      case "reviews":
        return listing.providerReviewCount === null
          ? EMPTY_VALUE
          : String(listing.providerReviewCount);
      case "freshness":
        return listing.freshnessAt === null ? EMPTY_VALUE : day(listing.freshnessAt);
      case "updated":
        return listing.updatedAt === null ? EMPTY_VALUE : day(listing.updatedAt);
    }
  };

  if (isError) {
    return (
      <p className="py-6 text-center text-sm font-medium text-natural-500">{t("detailError")}</p>
    );
  }

  const rows = isPending ? null : detailRows(data.sideA.listing, data.sideB.listing, value);

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)] gap-4 text-left lg:grid-cols-2">
      {([candidate.sideA, candidate.sideB] as const).map((side, index) => (
        <DetailPanel
          key={side.sourceId}
          which={index === 0 ? "a" : "b"}
          side={side}
          detail={isPending ? null : index === 0 ? data.sideA.listing : data.sideB.listing}
          rows={rows}
        />
      ))}
    </div>
  );
}

function DetailPanel({
  which,
  side,
  detail,
  rows,
}: {
  which: "a" | "b";
  side: DuplicateSide;
  detail: DuplicateDetailListing | null;
  /** Null while the specs are still loading; the photos are already here. */
  rows: DetailRow[] | null;
}) {
  const t = useTranslations("Admin.Duplicates");
  const listing = side.listing;

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-natural-100 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-[1.3] font-semibold text-natural-500">
          {which === "a" ? t("sideA") : t("sideB")}
        </span>
        <h3 className="truncate text-base leading-[1.3] font-bold text-foreground">
          {listing ? listing.title : t("unavailable.title")}
        </h3>
      </div>

      <DuplicatePhotos thumbs photos={listing?.photos ?? []} title={listing?.title ?? ""} />

      {rows === null ? (
        <Skeleton className="h-96 w-full rounded-md" />
      ) : detail === null ? (
        <p className="text-sm leading-[1.3] font-medium text-natural-500">
          {t("unavailable.description")}
        </p>
      ) : (
        <>
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
                  {t(`detailFields.${row.key}`)}
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

          <div className="flex flex-col gap-2">
            <h4 className="text-sm leading-[1.3] font-semibold text-natural-500">
              {t("amenitiesTitle", { count: detail.amenities.length })}
            </h4>
            {detail.amenities.length === 0 ? (
              <p className="text-sm leading-[1.3] font-medium text-natural-500">
                {t("noAmenities")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {detail.amenities.map((name) => (
                  <Chip key={name} variant="neutral">
                    {name}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm leading-[1.3] font-semibold text-natural-500">
              {t("descriptionTitle")}
            </h4>
            {detail.description === null ? (
              <p className="text-sm leading-[1.3] font-medium text-natural-500">
                {t("noDescription")}
              </p>
            ) : (
              /* Provider prose runs long and unevenly between the two sides; a fixed box keeps
                 the columns comparable and scrolls the rest. */
              <p className="max-h-60 overflow-y-auto text-sm leading-[1.5] font-medium whitespace-pre-line text-foreground">
                {detail.description}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
