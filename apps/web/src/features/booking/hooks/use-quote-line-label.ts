"use client";

import { useTranslations } from "next-intl";

import type { QuoteLine } from "../api/queries";
import { quoteLineLabel } from "../lib/quote-line-label";

/**
 * Shared by the sidebar and the review step because they name the same lines. The review step
 * printed `line.label` raw, so the sidebar could say one thing about a charge and the last
 * screen before payment another.
 */
export function useQuoteLineLabel() {
  const t = useTranslations("Common.quoteLines");

  return (line: QuoteLine) => quoteLineLabel(line, (key) => t(key));
}
