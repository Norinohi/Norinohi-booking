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

import { locales } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";
import { isBrowser } from "@/utils/runtime";

/*
 * LanguageSwitcher — Figma "Menu Item" (node 972:54534). A white 8px-radius card with a 1px
 * natural-100 border and a 4/4/10 shadow, holding 14 SemiBold rows; the active row carries a
 * brand check. The check keeps its box on inactive rows so the label column never reflows.
 * Language names are translated (per the design) rather than endonyms.
 */
export default function LanguageSwitcher() {
  const t = useTranslations("Layout.Nav");
  const active = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  /*
   * Switching language is now a navigation, not a cookie write — the locale lives in the URL
   * (docs/adr/0001). `pathname` here is locale-stripped, so handing it back with a `locale`
   * option re-prefixes it for the target language.
   *
   * The query string is read off `window.location` at click time rather than via
   * `useSearchParams`, which would pull this component out of the prerendered shell and force a
   * Suspense boundary around the nav bar. Filters on /yachts therefore survive the switch.
   */
  function switchTo(locale: (typeof locales)[number]) {
    const search = isBrowser ? window.location.search : "";
    router.replace(`${pathname}${search}`, { locale });
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
        className="w-auto min-w-45 gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-[4px_4px_10px_rgba(0,0,0,0.1)] ring-0"
      >
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => {
              switchTo(locale);
            }}
            className="-mx-4 gap-2 px-4 py-2 text-sm font-semibold capitalize leading-[1.2] tracking-[0.02em] text-foreground focus:bg-natural-50 focus:text-foreground"
          >
            <span className="flex-1 truncate">{t(`languages.${locale}`)}</span>
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
