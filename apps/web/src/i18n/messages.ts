import type { Messages } from "next-intl";

import type { Locale } from "./config";

type Namespace = keyof Messages;

/*
 * One loader per locale rather than a template import, so `satisfies` checks every locale's
 * namespace set against the `en` shape `Messages` is declared from. Key-level parity for all four
 * locales is `pnpm --filter web check-messages`.
 */
const loaders = {
  en: () => import("../../messages/en"),
  de: () => import("../../messages/de"),
  es: () => import("../../messages/es"),
  uk: () => import("../../messages/uk"),
} satisfies Record<Locale, () => Promise<{ default: Messages }>>;

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await loaders[locale]()).default;
}

/*
 * What the browser never needs. An exclusion list instead of an inclusion list on purpose: a new
 * namespace reaches client components by default, so forgetting to register it costs bytes rather
 * than a MISSING_MESSAGE at runtime.
 *
 * `Seo` is read only by `generateMetadata` and server components. `Admin` is read only under
 * `features/admin`, which only the (admin) route group renders, and that layout mounts its own
 * provider with it.
 */
const SERVER_ONLY: readonly Namespace[] = ["Seo"];
const ADMIN_ONLY: readonly Namespace[] = ["Admin"];

function omit(messages: Messages, namespaces: readonly Namespace[]): Partial<Messages> {
  const picked: Partial<Messages> = { ...messages };
  for (const namespace of namespaces) {
    delete picked[namespace];
  }
  return picked;
}

export function publicClientMessages(messages: Messages) {
  return omit(messages, [...SERVER_ONLY, ...ADMIN_ONLY]);
}

export function adminClientMessages(messages: Messages) {
  return omit(messages, SERVER_ONLY);
}
