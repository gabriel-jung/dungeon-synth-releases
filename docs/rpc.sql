-- Supabase RPCs used by this site.
--
-- Keep this file in sync with the live database. Treat the live Supabase
-- project as the source of truth; whenever you edit a function there, paste
-- the updated body back here so future sessions can read exact semantics
-- without guessing joins or tag-filter logic.
--
-- Conventions:
--   p_year int default null    — null = all-time, int = restrict to that year
--   p_include_tags text[]      — album must have ALL these tag names
--   p_exclude_tags text[]      — album must have NONE of these tag names


-- ---------------------------------------------------------------------------
-- year_counts
-- Per-year release counts, honouring tag filters. Used by the stats page
-- "Releases per Year" bar plot.
-- ---------------------------------------------------------------------------
create or replace function year_counts(
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(year int, n bigint)
language sql stable
as $$
  SELECT extract(year FROM a.date)::int AS year, count(*)::bigint AS n
  FROM albums a
  WHERE a.date IS NOT NULL
    AND (cardinality(p_include_tags) = 0 OR a.id IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_include_tags)
      GROUP BY at.album_id
      HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
    ))
    AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_exclude_tags)
    ))
  GROUP BY extract(year FROM a.date)
  ORDER BY year;
$$;


-- ---------------------------------------------------------------------------
-- tag_counts_by_category
-- Top-K tags in a given category (e.g. 'genre', 'theme'), ranked by album
-- count, optionally narrowed by year + include/exclude tag filters. Used by
-- the stats page "Popular Genres" / "Popular Themes" and by the scope modal
-- bars. `p_top_k = NULL` returns every tag in the category.
-- ---------------------------------------------------------------------------
create or replace function tag_counts_by_category(
  p_category text,
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[],
  p_top_k int default 50
)
returns table(name text, n bigint)
language sql stable
as $$
  WITH matching_albums AS (
    SELECT a.id
    FROM albums a
    WHERE (p_year IS NULL OR extract(year FROM a.date)::int = p_year)
      AND (cardinality(p_include_tags) = 0 OR a.id IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_include_tags)
        GROUP BY at.album_id
        HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
      ))
      AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_exclude_tags)
      ))
  )
  SELECT t.name, count(*)::bigint AS n
  FROM matching_albums m
  JOIN album_tags at ON at.album_id = m.id
  JOIN tags t ON t.id = at.tag_id
  WHERE t.category = p_category
  GROUP BY t.name
  ORDER BY n DESC
  LIMIT p_top_k;
$$;


-- ---------------------------------------------------------------------------
-- host_counts
-- Top Bandcamp hosts (labels / self-published artists) ranked by release
-- count, honouring year + tag filters. Drives the stats "Most Active Pages".
-- ---------------------------------------------------------------------------
create or replace function host_counts(
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(host_id int8, name text, image_id int8, url text, n bigint)
language sql stable
as $$
  SELECT h.id, h.name, h.image_id, h.url, count(*)::bigint
  FROM albums a
  JOIN hosts h ON h.id = a.host_id
  WHERE (p_year IS NULL OR extract(year FROM a.date) = p_year)
    AND (cardinality(p_include_tags) = 0 OR a.id IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_include_tags)
      GROUP BY at.album_id
      HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
    ))
    AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_exclude_tags)
    ))
  GROUP BY h.id, h.name, h.image_id, h.url
  ORDER BY count(*) DESC;
$$;


-- ---------------------------------------------------------------------------
-- daily_counts
-- Release count per day, honouring year + tag filters. Drives the calendar
-- heatmap popover on the releases page (and previously the stats heatmap).
-- ---------------------------------------------------------------------------
create or replace function daily_counts(
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(date date, n bigint)
language sql stable
as $$
  SELECT a.date, count(*)::bigint
  FROM albums a
  WHERE (p_year IS NULL OR extract(year FROM a.date) = p_year)
    AND (cardinality(p_include_tags) = 0 OR a.id IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_include_tags)
      GROUP BY at.album_id
      HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
    ))
    AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_exclude_tags)
    ))
  GROUP BY a.date
  ORDER BY a.date;
$$;


-- ---------------------------------------------------------------------------
-- album_duration_hist
-- Histogram of total album duration, bucketed by minute range with wider
-- buckets beyond 60min. Density-rendered on the stats page.
-- ---------------------------------------------------------------------------
create or replace function album_duration_hist(
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(bucket text, bucket_order int, bucket_width int, n bigint)
language sql stable
as $$
  WITH binned AS (
    SELECT
      CASE
        WHEN duration_sec < 600  THEN '<10min'
        WHEN duration_sec < 1200 THEN '10-20min'
        WHEN duration_sec < 1800 THEN '20-30min'
        WHEN duration_sec < 2400 THEN '30-40min'
        WHEN duration_sec < 3000 THEN '40-50min'
        WHEN duration_sec < 3600 THEN '50-60min'
        WHEN duration_sec < 4500 THEN '60-75min'
        WHEN duration_sec < 5400 THEN '75-90min'
        ELSE                          '90min+'
      END AS bucket,
      CASE
        WHEN duration_sec < 600  THEN 1
        WHEN duration_sec < 1200 THEN 2
        WHEN duration_sec < 1800 THEN 3
        WHEN duration_sec < 2400 THEN 4
        WHEN duration_sec < 3000 THEN 5
        WHEN duration_sec < 3600 THEN 6
        WHEN duration_sec < 4500 THEN 7
        WHEN duration_sec < 5400 THEN 8
        ELSE                          9
      END AS bucket_order,
      CASE
        WHEN duration_sec < 4500 THEN 10
        WHEN duration_sec < 5400 THEN 15
        ELSE                          30
      END AS bucket_width
    FROM albums a
    WHERE (p_year IS NULL OR extract(year FROM a.date) = p_year)
      AND duration_sec IS NOT NULL AND duration_sec > 0
      AND (cardinality(p_include_tags) = 0 OR a.id IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_include_tags)
        GROUP BY at.album_id
        HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
      ))
      AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_exclude_tags)
      ))
  )
  SELECT bucket, bucket_order, MAX(bucket_width)::int, COUNT(*)::bigint
  FROM binned
  GROUP BY bucket, bucket_order
  ORDER BY bucket_order;
$$;


-- ---------------------------------------------------------------------------
-- tracks_per_album_hist
-- Histogram of track counts per album. Buckets widen beyond 10 tracks so
-- the long tail doesn't dominate. Density-rendered on the stats page.
-- ---------------------------------------------------------------------------
create or replace function tracks_per_album_hist(
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(bucket text, bucket_order int, bucket_width int, n bigint)
language sql stable
as $$
  WITH binned AS (
    SELECT
      CASE
        WHEN num_tracks BETWEEN 1 AND 10 THEN num_tracks::text
        WHEN num_tracks BETWEEN 11 AND 12 THEN '11-12'
        WHEN num_tracks BETWEEN 13 AND 15 THEN '13-15'
        WHEN num_tracks BETWEEN 16 AND 20 THEN '16-20'
        WHEN num_tracks > 20 THEN '21+'
      END AS bucket,
      CASE
        WHEN num_tracks BETWEEN 1 AND 10 THEN num_tracks
        WHEN num_tracks BETWEEN 11 AND 12 THEN 11
        WHEN num_tracks BETWEEN 13 AND 15 THEN 12
        WHEN num_tracks BETWEEN 16 AND 20 THEN 13
        WHEN num_tracks > 20 THEN 14
      END AS bucket_order,
      CASE
        WHEN num_tracks BETWEEN 1 AND 10 THEN 1
        WHEN num_tracks BETWEEN 11 AND 12 THEN 2
        WHEN num_tracks BETWEEN 13 AND 15 THEN 3
        WHEN num_tracks BETWEEN 16 AND 20 THEN 5
        WHEN num_tracks > 20 THEN 10
      END AS bucket_width
    FROM albums a
    WHERE (p_year IS NULL OR extract(year FROM a.date) = p_year)
      AND num_tracks IS NOT NULL AND num_tracks > 0
      AND (cardinality(p_include_tags) = 0 OR a.id IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_include_tags)
        GROUP BY at.album_id
        HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
      ))
      AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
        SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_exclude_tags)
      ))
  )
  SELECT bucket, bucket_order, MAX(bucket_width)::int, COUNT(*)::bigint
  FROM binned
  WHERE bucket IS NOT NULL
  GROUP BY bucket, bucket_order
  ORDER BY bucket_order;
$$;


-- ---------------------------------------------------------------------------
-- tag_counts
-- Flat count of all tags in a given category across albums. Default category
-- is 'genre' (preserves pre-rename callers). Feeds the TagFilter panel.
-- When p_top_k is set, returns only the K most-used tags (by count desc,
-- name asc for deterministic ties). NULL = unbounded.
--
-- Returns a jsonb array in a single row so PostgREST's 1000-row cap does
-- not bound the result. Caller does one HTTP call, no pagination.
-- ---------------------------------------------------------------------------
create or replace function tag_counts(
  p_category text default 'genre',
  p_top_k int default null
)
returns jsonb
language sql stable
as $$
  WITH ranked AS (
    SELECT t.name, count(*)::bigint AS n
    FROM album_tags at
    JOIN tags t ON t.id = at.tag_id
    WHERE t.category = p_category
    GROUP BY t.name
    ORDER BY n DESC, t.name ASC
    LIMIT p_top_k
  )
  SELECT coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY n DESC, name ASC), '[]'::jsonb) FROM ranked;
$$;


-- ---------------------------------------------------------------------------
-- tag_pairs
-- Unordered co-occurrence pairs of tags in a given category on the same
-- album, with the shared album count. Default category is 'genre'. Feeds
-- the /genres map edges. When p_top_k is set, only considers pairs where
-- both tags are among the K most-used tags in the category — caps result
-- at C(K,2) pairs and keeps the self-join over a small tag set.
--
-- Returns a jsonb array in a single row (see tag_counts note). One HTTP
-- call regardless of pair count.
-- ---------------------------------------------------------------------------
create or replace function tag_pairs(
  p_category text default 'genre',
  p_top_k int default null
)
returns jsonb
language sql stable
as $$
  WITH top_tags AS (
    SELECT t.id, t.name
    FROM tags t
    JOIN album_tags at ON at.tag_id = t.id
    WHERE t.category = p_category
    GROUP BY t.id, t.name
    ORDER BY count(*) DESC, t.name ASC
    LIMIT p_top_k
  ),
  pairs AS (
    SELECT
      LEAST(t1.name, t2.name)    AS tag_a,
      GREATEST(t1.name, t2.name) AS tag_b,
      count(*)::bigint           AS n
    FROM album_tags at1
    JOIN album_tags at2 ON at1.album_id = at2.album_id AND at1.tag_id < at2.tag_id
    JOIN top_tags t1 ON t1.id = at1.tag_id
    JOIN top_tags t2 ON t2.id = at2.tag_id
    GROUP BY tag_a, tag_b
  )
  SELECT coalesce(jsonb_agg(to_jsonb(pairs) ORDER BY n DESC, tag_a ASC, tag_b ASC), '[]'::jsonb) FROM pairs;
$$;


-- ---------------------------------------------------------------------------
-- distinct_years
-- Every year with at least one release, plus the count. Callers currently
-- ignore `n` and only use `year` for the past-years picker.
-- ---------------------------------------------------------------------------
create or replace function distinct_years()
returns table(year int, n bigint)
language sql stable
as $$
  select extract(year from date)::int as year, count(*)::bigint as n
  from albums
  where date is not null
  group by 1
  order by 1 desc;
$$;


-- ---------------------------------------------------------------------------
-- list_filtered_albums
-- Paginated album listing with tag filters and date-keyset pagination.
-- `p_before` / `p_after` are open bounds (strict <, >). Sorted newest-first.
-- Drives the filtered-path of the home release list and /api/albums/by-scope.
-- ---------------------------------------------------------------------------
create or replace function list_filtered_albums(
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[],
  p_before date default null,
  p_after date default null,
  p_limit int default 500
)
returns table(
  id int8,
  artist text,
  title text,
  url text,
  date date,
  art_id int8,
  host_id int8,
  host_name text,
  host_image_id int8,
  host_url text
)
language sql stable
as $$
  SELECT
    a.id, a.artist, a.title, a.url, a.date, a.art_id,
    h.id AS host_id, h.name AS host_name, h.image_id AS host_image_id, h.url AS host_url
  FROM albums a
  JOIN hosts h ON h.id = a.host_id
  WHERE
    (p_before IS NULL OR a.date < p_before)
    AND (p_after IS NULL OR a.date > p_after)
    AND (cardinality(p_include_tags) = 0 OR a.id IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_include_tags)
      GROUP BY at.album_id
      HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
    ))
    AND (cardinality(p_exclude_tags) = 0 OR a.id NOT IN (
      SELECT at.album_id FROM album_tags at JOIN tags t ON t.id = at.tag_id
      WHERE t.name = ANY(p_exclude_tags)
    ))
  ORDER BY a.date DESC
  LIMIT p_limit;
$$;


-- ---------------------------------------------------------------------------
-- search_all
-- Substring search over artist, title, and host name for the command palette
-- (components/SearchPalette.tsx → /api/search). Returns a single jsonb row
-- containing an array of matching albums, newest first.
--
-- No title-dedupe: the same release may legitimately exist as multiple rows
-- when an album is uploaded both to the artist's self-host and to a label's
-- host (common in the scene — usually different art, tracklist, or physical
-- edition). Each is a distinct bandcamp release, and search should surface
-- all of them so users can pick the specific edition they want.
-- ---------------------------------------------------------------------------
create or replace function search_all(
  p_q text,
  p_limit int default 50
)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc nulls last), '[]'::jsonb)
  from (
    select a.id, a.artist, a.title, a.url, a.date, a.art_id,
           h.id as host_id, h.name as host_name,
           h.image_id as host_image_id, h.url as host_url
    from albums a
    join hosts h on h.id = a.host_id
    where a.artist ilike '%' || p_q || '%'
       or a.title  ilike '%' || p_q || '%'
       or h.name   ilike '%' || p_q || '%'
    order by a.date desc nulls last
    limit p_limit
  ) x;
$$;
