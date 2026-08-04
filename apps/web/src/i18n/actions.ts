"use server";

import { hasLocale } from "next-intl";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, locales } from "./config";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(candidate: string) {
  if (!hasLocale(locales, candidate)) return;

  (await cookies()).set(LOCALE_COOKIE, candidate, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
