"use client";

import {
  type DisplayCurrency,
  convertForDisplay,
  type FxSnapshot,
  resolveDisplayCurrency,
} from "@yacht-charter/api/lib/display-currency";
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from "react";

import { readCountryCookie, readStoredCurrency, writeStoredCurrency } from "@/lib/display-currency";
import { useCurrencySettings, useFxRates } from "@/features/yachts/hooks/use-display-currency";

/*
 * Which currency this visitor reads prices in, decided entirely in the browser.
 *
 * Nothing about the visitor may reach a cached page: the catalogue is prerendered once for
 * everyone (docs/adr/0002), so the country cookie, the stored preference and the rates are all
 * read after mount and the conversion is applied to figures the server already sent in the
 * vendor's own currency.
 *
 * The cost is a first paint in the published currency, which then settles into the visitor's.
 * The alternatives were a hydration mismatch or giving up the static shell, and both are worse
 * than a number that changes once on a page that has not finished loading. `display` is
 * therefore null until mount, and every consumer treats null as "show what was published".
 */

type CurrencyState = {
  /** Null before mount and whenever the feature is off, meaning "leave prices as published". */
  display: DisplayCurrency | null;
  snapshot: FxSnapshot | null;
  /** Null while the marketplace has not turned the feature on, which hides the switcher. */
  choices: readonly DisplayCurrency[] | null;
  choose: (currency: DisplayCurrency) => void;
};

const CurrencyContext = createContext<CurrencyState>({
  display: null,
  snapshot: null,
  choices: null,
  choose: () => {},
});

const OFFERED: readonly DisplayCurrency[] = ["EUR", "USD", "GBP", "PLN", "UAH"];

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const settings = useCurrencySettings();
  const enabled = settings.data?.displayCurrencyEnabled ?? false;
  const rates = useFxRates(enabled);

  /* Null until the effect below runs, which is what keeps the first client render identical to
     the server's. */
  const [chosen, setChosen] = useState<DisplayCurrency | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChosen(readStoredCurrency());
    setCountry(readCountryCookie());
    setMounted(true);
  }, []);

  const display = useMemo(() => {
    if (!mounted || !enabled || !settings.data) return null;
    return resolveDisplayCurrency({
      chosen,
      country,
      overrides: settings.data.displayCurrencyByCountry,
      fallback: settings.data.displayCurrencyDefault,
    });
  }, [mounted, enabled, settings.data, chosen, country]);

  const value = useMemo<CurrencyState>(
    () => ({
      display,
      snapshot: rates.data ?? null,
      choices: enabled ? OFFERED : null,
      choose: (currency) => {
        writeStoredCurrency(currency);
        setChosen(currency);
      },
    }),
    [display, rates.data, enabled],
  );

  return <CurrencyContext value={value}>{children}</CurrencyContext>;
}

export function useDisplayCurrency(): CurrencyState {
  return use(CurrencyContext);
}

/**
 * One published amount as this visitor should read it.
 *
 * Returns the original wherever converting would be a guess -- before mount, with the feature
 * off, with stale rates, or with no rate for that currency -- so a caller can always render
 * what it gets back.
 */
export function useConvertPrice() {
  const { display, snapshot } = useDisplayCurrency();

  return (amountMinor: number, currency: string) => {
    if (!display) return { amountMinor, currency, approximate: false };
    return convertForDisplay({ amountMinor, currency }, display, snapshot);
  };
}
