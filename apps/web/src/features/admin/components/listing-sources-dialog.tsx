"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
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
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useListingFieldSources,
  useSetListingFieldSource,
  useSplitListingOffer,
} from "../hooks/use-listings";
import type { ListingFieldGroup, ListingOfferSummary } from "../types";

/*
 * ListingSourcesDialog — which vendor a merged listing takes each part of itself from.
 *
 * The resolver already decides: a locked override first, then the stated rule for media,
 * then whichever record says more, then the provider preference. It writes the choice back,
 * so this shows what it chose rather than guessing at it, and lets a person overrule any
 * group. A locked group is the one thing the nightly run will not touch, which is the whole
 * point — before this, the only way to keep one vendor's photographs was to hope the counts
 * kept coming out that way.
 *
 * Releasing a group is as important as pinning one: once the reason for the override has gone,
 * it should go back to being recomputed rather than frozen on a vendor nobody chose today.
 */

/** The order a reviewer reads them in: what the card shows first, then the long tail. */
const FIELD_ORDER: readonly ListingFieldGroup[] = [
  "media",
  "title",
  "spec",
  "description",
  "taxonomy",
  "operator",
  "home_base",
  "pets",
];

export default function ListingSourcesDialog({
  listingId,
  listingTitle,
  open,
  onOpenChange,
}: {
  listingId: string;
  listingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Listings.sources");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[90dvh] w-[95vw] max-w-240 items-stretch overflow-y-auto"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-left">{listingTitle}</DialogTitle>
          <DialogDescription className="text-left">{t("subtitle")}</DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so the offers are fetched on the click and not before. */}
        {open ? <SourcesBody listingId={listingId} onSplit={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SourcesBody({ listingId, onSplit }: { listingId: string; onSplit: () => void }) {
  const t = useTranslations("Admin.Listings.sources");
  const { data, isPending, isError } = useListingFieldSources(listingId);
  const setSource = useSetListingFieldSource();
  const splitOffer = useSplitListingOffer();

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <p className="text-sm text-danger-600">{t("error")}</p>;

  const choose = (field: ListingFieldGroup, listingOfferId: string | null) => {
    setSource.mutate(
      { listingId, field, listingOfferId },
      {
        onSuccess: () => toast.success(listingOfferId === null ? t("released") : t("pinned")),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  /*
   * Undoing the merge, which belongs here rather than in the review queue: the queue decides
   * pairs, and by this point the pair is one listing with two vendors on it. Only offered while
   * more than one is left, because taking the last one out would leave the listing empty.
   */
  const takeOut = (listingOfferId: string) => {
    splitOffer.mutate(
      { listingOfferId },
      {
        onSuccess: (result) => {
          toast.success(result.restoredOrigin ? t("splitRestored") : t("splitNew"));
          onSplit();
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {data.offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            onTakeOut={data.offers.length > 1 ? () => takeOut(offer.id) : undefined}
            busy={splitOffer.isPending}
          />
        ))}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-natural-200 text-left">
            <th className="py-2 font-semibold">{t("field")}</th>
            <th className="py-2 font-semibold">{t("takenFrom")}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {FIELD_ORDER.map((field) => {
            const decision = data.decisions.find((row) => row.field === field);
            const current = data.offers.find((offer) => offer.id === decision?.listingOfferId);

            return (
              <tr key={field} className="border-b border-natural-100 last:border-0">
                <td className="py-2 whitespace-nowrap">{t(`fields.${field}`)}</td>
                <td className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {data.offers.map((offer) => {
                      const chosen = offer.id === current?.id;
                      return (
                        <Button
                          key={offer.id}
                          size="sm"
                          variant={chosen ? "brand" : "subtle"}
                          disabled={setSource.isPending}
                          onClick={() => choose(field, offer.id)}
                        >
                          {offer.provider}
                        </Button>
                      );
                    })}
                    {decision?.locked ? (
                      <Chip variant="warning">{t("locked")}</Chip>
                    ) : (
                      <Chip variant="neutral">{t("automatic")}</Chip>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right">
                  {/*
                    Only offered where something is pinned. On an unlocked group it would do
                    nothing, and a button that does nothing reads as a broken one.
                  */}
                  {decision?.locked ? (
                    <Button
                      size="sm"
                      variant="neutral"
                      disabled={setSource.isPending}
                      onClick={() => choose(field, null)}
                    >
                      {t("release")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Enough of each vendor's own reading of the boat to choose between them here. */
function OfferCard({
  offer,
  onTakeOut,
  busy,
}: {
  offer: ListingOfferSummary;
  onTakeOut?: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("Admin.Listings.sources");
  const dash = "—";

  const facts: [string, string][] = [
    [t("model"), offer.modelName ?? dash],
    [t("year"), offer.yearBuilt === null ? dash : String(offer.yearBuilt)],
    [t("base"), offer.baseName ?? dash],
    [t("operator"), offer.operatorName ?? dash],
    [t("photos"), String(offer.photoCount)],
    [t("descriptions"), String(offer.descriptionCount)],
  ];

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-natural-200 p-3",
        offer.status === "active" ? null : "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <Chip variant="neutral">{offer.provider}</Chip>
        {offer.status === "active" ? null : <Chip variant="warning">{offer.status}</Chip>}
      </div>
      <p className="text-sm leading-[1.3] font-medium">{offer.title ?? dash}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-natural-500">
        {facts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt>{label}</dt>
            <dd className="truncate text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {onTakeOut ? (
        <Button variant="neutral" size="sm" disabled={busy} onClick={onTakeOut}>
          {t("takeOut")}
        </Button>
      ) : null}
    </div>
  );
}
