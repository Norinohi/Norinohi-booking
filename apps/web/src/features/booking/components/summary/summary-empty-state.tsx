"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/data-display/image";
import Loader from "@/components/shared/feedback/loader";

export interface SummaryLoadErrorProps {
  onRetryLoad?: () => void;
}

export function SummaryLoadError({ onRetryLoad }: SummaryLoadErrorProps) {
  const t = useTranslations("YachtDetail");

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg bg-error-50 px-4 py-3">
      <span className="text-sm leading-4.5 font-medium text-error-600">
        {t("sidebar.loadFailed")}
      </span>
      {onRetryLoad ? (
        <button
          type="button"
          onClick={onRetryLoad}
          className="text-sm leading-4.5 font-bold text-error-600 underline underline-offset-2"
        >
          {t("sidebar.loadRetry")}
        </button>
      ) : null}
    </div>
  );
}

export interface SummaryEmptyStateProps {
  loading: boolean;
  unavailable: boolean;
  datesOnRequest: boolean;
  loadError: boolean;
  actions: boolean;
  onRequestQuote?: () => void;
}

/** What stands in for the breakdown before there is a quote: a spinner, or why there is none. */
export function SummaryEmptyState({
  loading,
  unavailable,
  datesOnRequest,
  loadError,
  actions,
  onRequestQuote,
}: SummaryEmptyStateProps) {
  const t = useTranslations("YachtDetail");

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-6 text-center">
      {loading && !unavailable && !loadError ? (
        <Loader />
      ) : (
        <>
          <Image
            src="/assets/illustrations/no-results.svg"
            alt=""
            width={128}
            height={131}
            unoptimized
          />
          {unavailable ? (
            <>
              <p className="text-sm font-semibold text-foreground">{t("sidebar.unavailable")}</p>
              <p className="text-sm font-medium text-natural-500">{t("sidebar.unavailableHint")}</p>
              {actions ? (
                <Button variant="neutral" onClick={onRequestQuote}>
                  {t("sidebar.requestQuote")}
                </Button>
              ) : null}
            </>
          ) : datesOnRequest ? (
            <>
              <p className="text-sm font-semibold text-foreground">{t("sidebar.onRequest")}</p>
              <p className="text-sm font-medium text-natural-500">{t("sidebar.onRequestHint")}</p>
              {actions ? (
                <Button variant="neutral" onClick={onRequestQuote}>
                  {t("sidebar.requestQuote")}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
