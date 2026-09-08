"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { Check, Coins } from "lucide-react";
import { useTranslations } from "next-intl";

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
 */
export default function CurrencySwitcher() {
  const t = useTranslations("Common.boatCard");
  const { display, choices, choose } = useDisplayCurrency();

  if (!choices || !display) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton variant="subtle" aria-label={t("currencyLabel")} className="rounded-sm" />
        }
      >
        <Coins className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-32 gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-[4px_4px_10px_rgba(0,0,0,0.1)] ring-0"
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
