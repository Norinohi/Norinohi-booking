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

import { setLocale } from "@/i18n/actions";
import { localeNames, locales } from "@/i18n/config";

export default function LanguageSwitcher() {
  const t = useTranslations("Layout.Nav");
  const active = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<IconButton variant="subtle" aria-label={t("language")} className="rounded-sm" />}
      >
        <Globe className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => {
              void setLocale(locale);
            }}
          >
            {localeNames[locale]}
            {locale === active && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
