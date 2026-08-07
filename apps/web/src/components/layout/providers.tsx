"use client";

import { Toaster } from "@yacht-charter/ui/components/feedback/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MotionConfig } from "motion/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { WishlistProvider } from "@/features/wishlist";
import { getQueryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <MotionConfig reducedMotion="user">
      <NuqsAdapter>
        <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
          <QueryClientProvider client={queryClient}>
            <WishlistProvider>{children}</WishlistProvider>
            <ReactQueryDevtools />
          </QueryClientProvider>
          <Toaster richColors />
        </ThemeProvider>
      </NuqsAdapter>
    </MotionConfig>
  );
}
