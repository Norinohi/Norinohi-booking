"use client";

import type { SelectOption } from "@yacht-charter/ui/components/form/select";
import { useLocale } from "next-intl";
import { useMemo } from "react";

import { COUNTRY_CODES } from "@/lib/countries";

/**
 * Country options for the active locale. `Intl.DisplayNames` supplies the names,
 * so the 250 codes stay out of the message files, and the sort has to follow the
 * translated name rather than the code: alphabetical in English is not
 * alphabetical in Ukrainian.
 */
export function useCountryOptions(): SelectOption[] {
  const locale = useLocale();

  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" });
    const collator = new Intl.Collator(locale);

    return COUNTRY_CODES.map((code) => ({ value: code, label: names.of(code) ?? code })).sort(
      (a, b) => collator.compare(a.label, b.label),
    );
  }, [locale]);
}
