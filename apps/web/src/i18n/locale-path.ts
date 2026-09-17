import { hasLocale } from "next-intl";

import { locales } from "./config";

export function stripLocalePrefix(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (first === undefined || !hasLocale(locales, first)) return pathname || "/";
  return `/${rest.join("/")}`;
}
