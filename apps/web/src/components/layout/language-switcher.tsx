"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { localeNames, locales } from "@/i18n/config";
import { stripLocalePrefix } from "@/i18n/locale-path";
import { useRouter } from "@/i18n/navigation";
import { isBrowser } from "@/utils/runtime";

/*
 * LanguageSwitcher — Figma "Menu Item" (node 972:54534). A white 8px-radius card with a 1px
 * natural-100 border and a 4/4/10 shadow, holding 14 SemiBold rows; the active row carries a
 * brand check. The check keeps its box on inactive rows so the label column never reflows.
 * Language names are always in English, whatever the active locale: a visitor who landed on the
 * wrong language needs to find their own in a list they can read, and the English names are the
 * ones that read the same to everyone.
 */
export default function LanguageSwitcher() {
  const t = useTranslations("Layout.Nav");
  const active = useLocale();
  const router = useRouter();

  /*
   * Switching language is a navigation, not a cookie write: the locale lives in the URL
   * (docs/adr/0001).
   *
   * The path and query are read off `window.location` at click time. next-intl's `usePathname`
   * strips the prefix of the locale the provider last rendered with, and after a client-side
   * switch that can still be the previous one, so the new prefix stayed on the path and the next
   * switch stacked another in front of it (/de/es/en). `useSearchParams` would also pull this
   * component out of the prerendered shell and force a Suspense boundary around the nav bar.
   */
  function switchTo(locale: (typeof locales)[number]) {
    if (!isBrowser) return;
    const { pathname, search } = window.location;
    router.replace(`${stripLocalePrefix(pathname)}${search}`, { locale });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<IconButton variant="subtle" aria-label={t("language")} className="rounded-sm" />}
      >
        <Globe className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-45 gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-popover ring-0"
      >
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => {
              switchTo(locale);
            }}
            className="-mx-4 gap-2 px-4 py-2 text-sm font-semibold capitalize leading-[1.2] tracking-[0.02em] text-foreground focus:bg-natural-50 focus:text-foreground"
          >
            <span className="flex-1 truncate">{localeNames[locale]}</span>
            <Check
              aria-hidden
              className={locale === active ? "size-6 text-brand" : "invisible size-6"}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
