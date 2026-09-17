-- Points discount category targets at the category group instead of a yacht_category id.
--
-- Since 932fddfe a category target names a group ("Motor yacht"), which spans one yacht_category
-- row per vendor. Rows written before that still hold an id: they keep applying, but the admin
-- shows "deleted category" when the id belongs to a row the catalogue no longer has, as the
-- seed's cat_* ids do on a database filled by a real sync. Those seed ids are resolved by the
-- names the seed gave them. Re-running changes nothing: a group name matches no id.

WITH resolved AS (
  SELECT t.id, coalesce(c.canonical_name, c.name) AS group_name
  FROM discount_target t
  JOIN yacht_category c ON c.id = t.target_id
  WHERE t.target_type = 'category'
  UNION ALL
  SELECT t.id, seed.group_name
  FROM discount_target t
  JOIN (VALUES
    ('cat_catamaran', 'Catamaran'),
    ('cat_sailing', 'Sailing yacht'),
    ('cat_motor', 'Motor yacht')
  ) AS seed(id, group_name) ON seed.id = t.target_id
  WHERE t.target_type = 'category'
    AND NOT EXISTS (SELECT 1 FROM yacht_category c WHERE c.id = t.target_id)
),
-- A discount that already targets the group keeps that row; the id row beside it goes.
duplicates AS (
  DELETE FROM discount_target t
  USING resolved r, discount_target existing
  WHERE t.id = r.id
    AND existing.discount_id = t.discount_id
    AND existing.target_type = 'category'
    AND existing.target_id = r.group_name
  RETURNING t.id
)
UPDATE discount_target t
SET target_id = r.group_name, updated_at = now()
FROM resolved r
WHERE t.id = r.id
  AND t.id NOT IN (SELECT id FROM duplicates);
