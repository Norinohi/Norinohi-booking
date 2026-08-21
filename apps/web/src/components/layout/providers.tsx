"use client";

import { Toaster } from "@yacht-charter/ui/components/feedback/sonner";
import { type UiLabels, UiLabelsProvider } from "@yacht-charter/ui/components/ui-labels";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useMemo } from "react";

import { WishlistProvider } from "@/features/wishlist";
import { getQueryClient } from "@/utils/orpc";

/**
 * The shared primitives in `packages/ui` carry English aria-labels and empty states. That package
 * knows no i18n, so this is the one place the translations reach them.
 */
function useUiLabels(): UiLabels {
  const t = useTranslations("Common.ui");
  return useMemo(
    () => ({
      close: t("close"),
      previousPage: t("previousPage"),
      nextPage: t("nextPage"),
      pagination: t("pagination"),
      breadcrumb: t("breadcrumb"),
      previousPhoto: t("previousPhoto"),
      nextPhoto: t("nextPhoto"),
      goToPhoto: (index, total) => t("goToPhoto", { index, total }),
      showPhoto: (index) => t("showPhoto", { index }),
      clear: (label) => t("clear", { label }),
      noOptions: t("noOptions"),
      noMatches: t("noMatches"),
      showPassword: t("showPassword"),
      hidePassword: t("hidePassword"),
      previousMonth: t("previousMonth"),
      nextMonth: t("nextMonth"),
      rating: (rating, max) => t("rating", { rating, max }),
    }),
    [t],
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const uiLabels = useUiLabels();

  return (
    <MotionConfig reducedMotion="user">
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <UiLabelsProvider labels={uiLabels}>
            <WishlistProvider>{children}</WishlistProvider>
          </UiLabelsProvider>
          <ReactQueryDevtools />
        </QueryClientProvider>
        {/* The app ships one theme — `light` is set on <html> in the root layout. There is no
            next-themes provider on purpose: it injects an inline <script>, and a locale switch
            remounts this tree on the client, where React refuses to run it and warns. The
            toaster is told the theme directly so it never falls back to the OS preference. */}
        <Toaster richColors theme="light" />
      </NuqsAdapter>
    </MotionConfig>
  );
}
