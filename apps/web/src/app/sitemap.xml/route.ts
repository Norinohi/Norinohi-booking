import { absolute, SITEMAP_NAMES } from "@/lib/sitemap";

/*
 * The sitemap index, written by hand because Next cannot emit one.
 *
 * Its `sitemap.(ts|js)` convention only produces a `<urlset>`, and `generateSitemaps` produces
 * `/sitemap/0.xml`-style children with no index above them and numbers instead of names in
 * Search Console. So the children use the file convention under `/sitemaps/*` and this route
 * names them.
 *
 * An index rather than four `Sitemap:` lines in robots.txt: it is submitted to Search Console
 * once, and a fifth child later needs no change there.
 */
export function GET(): Response {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_NAMES.map(
      (name) => `<sitemap><loc>${absolute(`/sitemaps/${name}/sitemap.xml`)}</loc></sitemap>`,
    ),
    "</sitemapindex>",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
