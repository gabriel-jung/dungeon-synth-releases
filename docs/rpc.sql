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
  select extract(year from a.date)::int as year, count(*)::bigint as n
  from albums a
  where a.date is not null
    and (
      cardinality(p_include_tags) = 0
      or (
        select count(distinct t.name)
        from album_tags at
        join tags t on t.id = at.tag_id
        where at.album_id = a.id and t.name = any(p_include_tags)
      ) = cardinality(p_include_tags)
    )
    and not exists (
      select 1
      from album_tags at
      join tags t on t.id = at.tag_id
      where at.album_id = a.id and t.name = any(p_exclude_tags)
    )
  group by extract(year from a.date)
  order by year;
$$;


-- ---------------------------------------------------------------------------
-- tag_counts_by_category
-- Top 50 tags in a given category (e.g. 'genre', 'theme'), ranked by album
-- count. Used by the stats page "Popular Genres" / "Popular Themes" lists.
-- ---------------------------------------------------------------------------
create or replace function tag_counts_by_category(
  p_category text,
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[]
)
returns table(name text, n bigint)
language sql stable
as $$
  select t.name, count(distinct a.id)::bigint as n
  from tags t
  join album_tags at on at.tag_id = t.id
  join albums a on a.id = at.album_id
  where t.category = p_category
    and (p_year is null or extract(year from a.date)::int = p_year)
    and (
      cardinality(p_include_tags) = 0
      or (
        select count(distinct t2.name)
        from album_tags at2
        join tags t2 on t2.id = at2.tag_id
        where at2.album_id = a.id and t2.name = any(p_include_tags)
      ) = cardinality(p_include_tags)
    )
    and not exists (
      select 1
      from album_tags at3
      join tags t3 on t3.id = at3.tag_id
      where at3.album_id = a.id and t3.name = any(p_exclude_tags)
    )
  group by t.name
  order by n desc
  limit 50;
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
  select
    a.id, a.artist, a.title, a.url, a.date, a.art_id,
    h.id as host_id, h.name as host_name, h.image_id as host_image_id, h.url as host_url
  from albums a
  join hosts h on h.id = a.host_id
  where
    (p_before is null or a.date < p_before)
    and (p_after is null or a.date > p_after)
    and (cardinality(p_include_tags) = 0 or (
      select count(distinct t.name)
      from album_tags at
      join tags t on t.id = at.tag_id
      where at.album_id = a.id and t.name = any(p_include_tags)
    ) = cardinality(p_include_tags))
    and (cardinality(p_exclude_tags) = 0 or not exists (
      select 1 from album_tags at
      join tags t on t.id = at.tag_id
      where at.album_id = a.id and t.name = any(p_exclude_tags)
    ))
  order by a.date desc
  limit p_limit;
$$;
