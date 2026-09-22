"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { Hint } from "@yacht-charter/ui/components/overlay/hint";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useDisplayCurrency } from "./currency-provider";

/*
 * CurrencySwitcher — the same menu shape as the language switcher beside it.
 *
 * Renders nothing at all until the marketplace has turned the currency layer on, and nothing on
 * the server: the visitor's currency is resolved after mount, so a control showing the active
 * one cannot be part of the prerendered shell. That is why the whole button appears rather than
 * flickering between values -- there is no honest first frame for it.
 *
 * A pick is remembered on this device and outranks detection from then on, permanently: a
 * visitor who switched to dollars in Warsaw meant it.
 *
 * The button names the active currency, so it says which one the prices are in before it is
 * opened. Its glyph where it has one ("€", "$", "£", "₴"), and otherwise its code: NOK, DKK and
 * SEK all write "kr", and "zł" is letters too, so a symbol made of letters is the code instead.
 */
function currencyMark(currency: string, locale: string): string {
  const symbol = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value;
  return symbol && symbol.length === 1 && !/\p{L}/u.test(symbol) ? symbol : currency;
}

export default function CurrencySwitcher() {
  const t = useTranslations("Common.boatCard");
  const locale = useLocale();
  const { display, choices, choose } = useDisplayCurrency();

  if (!choices || !display) return null;

  const mark = currencyMark(display, locale);

  return (
    <DropdownMenu>
      <Hint label={t("currencyLabel")}>
        <DropdownMenuTrigger
          render={
            <IconButton variant="subtle" aria-label={t("currencyLabel")} className="rounded-sm" />
          }
        >
          <span
            aria-hidden
            className={cn(
              "leading-none font-semibold",
              mark.length === 1 ? "text-2xl" : "text-xs tracking-wide",
            )}
          >
            {mark}
          </span>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-32 gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-popover ring-0"
      >
        {choices.map((currency) => (
          <DropdownMenuItem
            key={currency}
            onClick={() => {
              choose(currency);
            }}
            className="-mx-4 gap-2 px-4 py-2 text-sm font-semibold leading-[1.2] tracking-[0.02em] text-foreground focus:bg-natural-50 focus:text-foreground"
          >
            <span className="flex-1">{currency}</span>
            <Check
              aria-hidden
              className={currency === display ? "size-6 text-brand" : "invisible size-6"}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
