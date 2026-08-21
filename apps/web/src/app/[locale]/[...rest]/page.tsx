import { notFound } from "next/navigation";

/*
 * Without a catch-all, a URL that matches no route under `[locale]` falls past the locale
 * layout to Next's bare default 404. Routing it here makes `[locale]/not-found.tsx` render
 * instead, inside the app chrome and in the visitor's language.
 */
export default function CatchAllPage() {
  notFound();
}
