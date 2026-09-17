"use client";

import { useTranslations } from "next-intl";

import { toProviderKey } from "../types";

/** A stored provider code as its name; a code this build does not ship is shown as it came. */
export function useProviderLabel() {
  const t = useTranslations("Admin.providers");

  return (code: string) => {
    const key = toProviderKey(code);
    return key ? t(key) : code;
  };
}
