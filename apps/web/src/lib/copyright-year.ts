import { cacheLife } from "next/cache";

/*
 * The copyright year is not request data — it reads the same for every visitor for a whole day.
 *
 * Taking it through a `"use cache"` boundary is what keeps the footer inside the prerendered
 * shell: a bare `new Date()` at render time is sync IO, which makes every route that renders the
 * footer blocking, and the root layout renders it on all of them. A cached read counts as a cache
 * boundary rather than a blocking read, so the layout can await this and still prerender.
 */
export async function getCopyrightYear() {
  "use cache";
  cacheLife("days");

  return new Date().getFullYear();
}
