"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { type ComparisonKey, comparisonRows, EMPTY_VALUE, formatSignals } from "../lib/duplicates";
import {
  isResolvedElsewhere,
  useConfirmDuplicate,
  useRejectDuplicate,
} from "../hooks/use-duplicates";
import { type DuplicateCandidate, toProviderKey } from "../types";
import DuplicateSide from "./duplicate-side";

/* The comparison rows whose raw value is a code with a translated label; `provider` is the third. */
const LISTING_STATUSES = ["draft", "published", "hidden"] as const;
const MATCH_STATUSES = ["unmatched", "auto", "confirmed", "rejected"] as const;

/*
 * DuplicateCandidateCard — one proposed pair: a header carrying the matcher's confidence and
 * signals, the two sides side by side (stacked below lg), and the verdicts. Confirming names
 * the survivor, so there is one "keep this listing" per side rather than a single Confirm.
 * Both verdicts are irreversible for the reviewer but not destructive: the loser is hidden,
 * not deleted. A candidate someone else already resolved comes back CONFLICT; that is
 * reported as a stale queue and the list refetches (the mutation hooks invalidate on settle).
 */

export default function DuplicateCandidateCard({ candidate }: { candidate: DuplicateCandidate }) {
  const t = useTranslations("Admin.Duplicates");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const confirmDuplicate = useConfirmDuplicate();
  const rejectDuplicate = useRejectDuplicate();
  /* Which side's button was pressed, so only that one shows the pending label. */
  const [keeping, setKeeping] = useState<string | null>(null);

  const pending = candidate.decision === "pending";
  const busy = confirmDuplicate.isPending || rejectDuplicate.isPending;

  const value = (key: ComparisonKey, raw: string | number | null): string => {
    if (raw === null) return EMPTY_VALUE;
    if (key === "provider") {
      const provider = toProviderKey(String(raw));
      return provider ? tProviders(provider) : String(raw);
    }
    if (key === "status") {
      const status = LISTING_STATUSES.find((option) => option === raw);
      return status ? t(`listingStatus.${status}`) : String(raw);
    }
    if (key === "matchStatus") {
      const status = MATCH_STATUSES.find((option) => option === raw);
      return status ? t(`matchStatus.${status}`) : String(raw);
    }
    if (key === "length") return t("lengthValue", { value: raw });
    return String(raw);
  };

  const rows = comparisonRows(candidate, value);
  const signals = formatSignals(candidate.signals);
  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  const onError = (error: Error) => {
    toast.error(isResolvedElsewhere(error) ? t("toast.conflict") : t("toast.error"));
  };

  const keep = (keepListingId: string) => {
    setKeeping(keepListingId);
    confirmDuplicate.mutate(
      { candidateId: candidate.id, keepListingId },
      {
        onSuccess: (result) =>
          toast.success(t("toast.confirmed", { count: result.movedSourceCount })),
        onError,
        onSettled: () => setKeeping(null),
      },
    );
  };

  const reject = () => {
    rejectDuplicate.mutate(
      { candidateId: candidate.id },
      { onSuccess: () => toast.success(t("toast.rejected")), onError },
    );
  };

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-natural-100 p-4 md:p-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant={candidate.confidence === null ? "neutral" : "brand"}>
              {candidate.confidence === null
                ? t("confidenceUnknown")
                : t("confidence", { value: Math.round(candidate.confidence * 100) })}
            </Chip>
            <span className="text-sm leading-[1.3] font-medium text-natural-500">
              {candidate.reviewedAt
                ? t("reviewed", { date: day(candidate.reviewedAt) })
                : t("proposed", { date: day(candidate.createdAt) })}
            </span>
          </div>
          {signals ? (
            <p className="truncate text-sm leading-[1.3] font-medium text-natural-500">
              {t("signals", { signals })}
            </p>
          ) : null}
        </div>

        {pending ? (
          <Button variant="neutral" onClick={reject} disabled={busy}>
            {t("reject")}
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {([candidate.sideA, candidate.sideB] as const).map((side, index) => {
          const listingId = side.listing?.id;

          return (
            <DuplicateSide
              key={side.sourceId}
              which={index === 0 ? "a" : "b"}
              side={side}
              rows={rows}
              onKeep={pending && listingId ? () => keep(listingId) : undefined}
              keepPending={keeping !== null && keeping === listingId}
              keepDisabled={busy}
            />
          );
        })}
      </div>

      {rows.some((row) => row.differs) ? (
        <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("differsLegend")}</p>
      ) : null}
    </article>
  );
}
