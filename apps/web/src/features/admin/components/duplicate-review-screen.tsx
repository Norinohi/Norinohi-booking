"use client";

import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Select } from "@yacht-charter/ui/components/form/select";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";

import { useDuplicateQueue } from "../hooks/use-duplicates";
import type {
  DuplicateConfidenceBand,
  DuplicateConfidenceFilter,
  DuplicateDecision,
} from "../types";
import DuplicateCandidateCard from "./duplicate-candidate-card";

/*
 * DuplicateReviewScreen — /duplicates: the admin Sidebar beside the review queue, matching
 * the Discount Manager's shell (breadcrumb bar, 334px sidebar, bordered content card).
 * The decision tabs are the filter: "pending" is the work queue, the other two are the
 * audit trail, which is why resolved cards render without verdict buttons.
 */

const DECISIONS: readonly DuplicateDecision[] = ["pending", "confirmed", "rejected"];

const BANDS: readonly DuplicateConfidenceBand[] = ["high", "medium", "low", "unknown"];

/* Sentinel for "any rule": a real value, since a falsy selection makes Select show its placeholder. */
const ANY = "any";

/** The matcher rules this build ships labels for; anything else is shown as stored. */
const MATCH_TYPES = [
  "name+model+year",
  "base+model+year",
  "model+year",
  "model+yearBuilt",
] as const;

const SKELETON_CARDS = 2;

export default function DuplicateReviewScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Duplicates");
  const router = useRouter();
  const [decision, setDecision] = useState<DuplicateDecision>("pending");
  const [confidence, setConfidence] = useState<DuplicateConfidenceFilter>("all");
  const [matchedOn, setMatchedOn] = useState(ANY);
  const [page, setPage] = useState(1);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const { data, isPending, isError } = useDuplicateQueue({
    decision,
    confidence,
    matchedOn: matchedOn === ANY ? undefined : matchedOn,
    page,
  });

  const summary = data?.summary;

  const message = (text: string) => (
    <p className="py-10 text-center text-sm font-medium text-natural-500">{text}</p>
  );

  const withCount = (label: string, count: number) => t("optionCount", { label, count });

  const matchTypeLabel = (value: string) => {
    const known = MATCH_TYPES.find((option) => option === value);
    return known ? t(`matchType.${known}`) : value;
  };

  /* Both filters are facets of the decision they were counted over, so a tab switch clears
     them rather than leaving a selection the new tab has no rows for. */
  const changeDecision = (next: string) => {
    setDecision(DECISIONS.find((option) => option === next) ?? "pending");
    setConfidence("all");
    setMatchedOn(ANY);
    setPage(1);
  };

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="duplicates"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-col gap-2 border-b border-natural-50 px-4 py-5 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
              <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
            </div>

            <div className="flex flex-col gap-4 p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <Tabs value={decision} onValueChange={changeDecision}>
                  <TabsList>
                    {DECISIONS.map((option) => (
                      <TabsTab key={option} value={option}>
                        {summary
                          ? withCount(t(`filter.${option}`), summary.decisionCounts[option])
                          : t(`filter.${option}`)}
                      </TabsTab>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="min-w-0 sm:w-56">
                    <Select
                      className="h-12 min-w-0"
                      ariaLabel={t("filters.confidence")}
                      value={confidence}
                      onValueChange={(next) => {
                        setConfidence(BANDS.find((band) => band === next) ?? "all");
                        setPage(1);
                      }}
                      options={[
                        { value: "all", label: t("filters.anyConfidence") },
                        ...(summary?.confidenceBands ?? []).map((row) => ({
                          value: row.band,
                          label: withCount(t(`confidenceBand.${row.band}`), row.count),
                        })),
                      ]}
                    />
                  </div>
                  <div className="min-w-0 sm:w-56">
                    <Select
                      className="h-12 min-w-0"
                      ariaLabel={t("filters.matchType")}
                      value={matchedOn}
                      onValueChange={(next) => {
                        setMatchedOn(next);
                        setPage(1);
                      }}
                      options={[
                        { value: ANY, label: t("filters.anyMatchType") },
                        ...(summary?.matchTypes ?? []).map((row) => ({
                          value: row.value,
                          label: withCount(matchTypeLabel(row.value), row.count),
                        })),
                      ]}
                    />
                  </div>
                </div>
              </div>

              {summary ? (
                <p className="text-sm leading-[1.3] font-medium text-natural-500">
                  {t("summary", {
                    pairs: data.pagination.totalItems,
                    yachts: summary.listingCount,
                  })}
                </p>
              ) : null}

              {isPending
                ? Array.from({ length: SKELETON_CARDS }, (_, card) => (
                    <Skeleton key={card} className="h-125 w-full rounded-lg" />
                  ))
                : isError
                  ? message(t("error"))
                  : data.items.length === 0
                    ? message(t(`empty.${decision}`))
                    : data.items.map((candidate) => (
                        <DuplicateCandidateCard key={candidate.id} candidate={candidate} />
                      ))}

              {data && data.pagination.totalPages > 1 ? (
                <div className="flex justify-center md:justify-start">
                  <PaginationControl
                    page={page}
                    onPageChange={setPage}
                    pageCount={data.pagination.totalPages}
                    summary={false}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
