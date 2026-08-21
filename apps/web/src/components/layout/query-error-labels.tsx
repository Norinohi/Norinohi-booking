"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { setQueryErrorLabels } from "@/lib/query-error-labels";

/** Feeds the active locale's copy to the hook-less QueryCache toast in utils/orpc. Renders nothing. */
export default function QueryErrorLabels() {
  const t = useTranslations("Common.errors");
  const title = t("requestFailed");
  const retry = t("retry");

  useEffect(() => {
    setQueryErrorLabels({ title, retry });
  }, [title, retry]);

  return null;
}
