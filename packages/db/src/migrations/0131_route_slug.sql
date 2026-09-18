-- Gives every route a public address, /routes/<slug>.
--
-- The column is added nullable, filled, then tightened: routes already exist, and a NOT NULL
-- column with no default cannot be added over them. The fill mirrors `routeSlug` in
-- src/routes/route-slug.ts step for step (the letters NFKD leaves whole, then diacritics folded,
-- apostrophes dropped, everything else a hyphen), so a slug written here matches one the app
-- would write. A title with no Latin letters left falls back to 'route'. Where two titles land on
-- one slug the curated route keeps it and the rest are numbered from 2, as `uniqueSlug` does.

ALTER TABLE "suggested_route" ADD COLUMN "slug" text;--> statement-breakpoint
WITH base AS (
  SELECT
    id,
    coalesce(
      nullif(
        trim(
          both '-' FROM regexp_replace(
            regexp_replace(
              regexp_replace(
                normalize(
                  replace(replace(replace(replace(replace(replace(
                    lower(title), 'æ', 'ae'), 'ø', 'o'), 'å', 'a'), 'ß', 'ss'), 'đ', 'd'), 'ł', 'l'),
                  NFKD
                ),
                '[̀-ͯ]', '', 'g'
              ),
              '[''’]', '', 'g'
            ),
            '[^a-z0-9]+', '-', 'g'
          )
        ),
        ''
      ),
      'route'
    ) AS slug,
    featured_rank,
    created_at
  FROM suggested_route
),
ranked AS (
  SELECT
    id,
    slug,
    row_number() OVER (
      PARTITION BY slug
      ORDER BY featured_rank ASC NULLS LAST, created_at ASC, id ASC
    ) AS n
  FROM base
)
UPDATE suggested_route route
SET slug = CASE WHEN ranked.n = 1 THEN ranked.slug ELSE ranked.slug || '-' || ranked.n END
FROM ranked
WHERE ranked.id = route.id;--> statement-breakpoint
ALTER TABLE "suggested_route" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suggested_route_slug_uq" ON "suggested_route" USING btree ("slug");
