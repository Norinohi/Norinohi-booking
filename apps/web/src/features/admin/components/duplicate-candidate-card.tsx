"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import {
  type ComparisonKey,
  comparisonRows,
  EMPTY_VALUE,
  formatSignals,
  matchSignals,
} from "../lib/duplicates";
import {
  isResolvedElsewhere,
  useConfirmDuplicate,
  useRejectDuplicate,
} from "../hooks/use-duplicates";
import { type DuplicateCandidate, toProviderKey } from "../types";
import DuplicateDetailDialog from "./duplicate-detail-dialog";
import DuplicateSide from "./duplicate-side";

/* The matcher rules and criteria this build ships labels for; anything else is shown as stored. */
const MATCH_TYPES = [
  "name+model+year",
  "base+model+year",
  "model+year",
  "model+yearBuilt",
] as const;

const SIGNAL_FIELDS = [
  "name",
  "base",
  "area",
  "length",
  "cabins",
  "berths",
  "heads",
  "builder",
  "operator",
] as const;

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
  const [detailOpen, setDetailOpen] = useState(false);

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
  const signals = matchSignals(candidate.signals);
  /* A pair proposed before the matcher recorded its criteria still has something to say. */
  const legacySignals = signals ? null : formatSignals(candidate.signals);

  const matchTypeLabel = (kind: string) => {
    const known = MATCH_TYPES.find((option) => option === kind);
    return known ? t(`matchType.${known}`) : kind;
  };

  const signalLabel = (field: string) => {
    const known = SIGNAL_FIELDS.find((option) => option === field);
    return known ? t(`signalFields.${known}`) : field;
  };
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
          toast.success(
            result.closedCandidateCount > 0
              ? t("toast.confirmedWithClosed", {
                  count: result.movedSourceCount,
                  closed: result.closedCandidateCount,
                })
              : t("toast.confirmed", { count: result.movedSourceCount }),
          ),
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
            <div className="flex flex-wrap items-center gap-1.5">
              {signals.matchedOn ? (
                <span className="text-sm leading-[1.3] font-medium text-natural-500">
                  {t("signals", { signals: matchTypeLabel(signals.matchedOn) })}
                </span>
              ) : null}
              {signals.agreed.map((field) => (
                <Chip key={`agreed-${field}`} variant="success">
                  {signalLabel(field)}
                </Chip>
              ))}
              {signals.differed.map((field) => (
                <Chip key={`differed-${field}`} variant="warning">
                  {signalLabel(field)}
                </Chip>
              ))}
            </div>
          ) : legacySignals ? (
            <p className="truncate text-sm leading-[1.3] font-medium text-natural-500">
              {t("signals", { signals: legacySignals })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="subtle" onClick={() => setDetailOpen(true)}>
            {t("showDetail")}
          </Button>
          {pending ? (
            <Button variant="neutral" onClick={reject} disabled={busy}>
              {t("reject")}
            </Button>
          ) : null}
        </div>
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

      <DuplicateDetailDialog candidate={candidate} open={detailOpen} onOpenChange={setDetailOpen} />

      {rows.some((row) => row.differs) ? (
        <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("differsLegend")}</p>
      ) : null}
    </article>
  );
}
