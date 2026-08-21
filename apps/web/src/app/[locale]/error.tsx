"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";
import { Link } from "@/i18n/navigation";

/*
 * Segment error boundary for everything under `[locale]`; the layout itself is outside it, so
 * the chrome stays up. `retry` re-fetches and re-renders the failed subtree (Next 16 — `reset`
 * only clears the boundary without refetching).
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Common.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl items-center px-4 py-16 md:py-24">
      <EmptyState
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="brand" onClick={() => retry()}>
              {t("retry")}
            </Button>
            <Button variant="neutral" nativeButton={false} render={<Link href="/" />}>
              {t("home")}
            </Button>
          </div>
        }
      />
    </main>
  );
}
