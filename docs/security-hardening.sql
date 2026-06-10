-- Migration: security hardening (DoS surface reduction on the RPC layer).
--
-- APPLIED in production 2026-06-10. Historical record + fresh-bootstrap replay
-- only. The clamped function bodies below are a snapshot of what was applied;
-- docs/rpc.sql is the living source of truth for current function logic, edit
-- there, not here. All statements are idempotent; safe to re-run.
--
-- Why: the site uses the publishable (anon) key, so anyone can call the RPCs
-- directly via PostgREST, bypassing the Next route rate limiter. The route
-- handlers' Math.min() caps therefore do NOT bind direct callers. This
-- migration moves the bounds into the database (authoritative) and locks down
-- the one function anon should never be able to invoke.
--
-- Findings addressed (from the 2026-06-10 security review):
--   F1  refresh_tag_graph() callable by anon  -> revoke (HIGH)
--   F3  p_top_k / p_limit trusted from client -> server-side clamps (MEDIUM)
--   F6  tag_pair_counts MV has no explicit revoke -> revoke (LOW)
--
-- F2 (lock down EXECUTE to only what the site needs): the only non-site
-- function is refresh_tag_graph(), handled by F1. Every other RPC is called
-- by the site's server components / API routes with the anon key, so they
-- must remain anon-executable. Their cost is bounded by the clamps below.


-- ---------------------------------------------------------------------------
-- F1 + F6: privilege revokes
-- ---------------------------------------------------------------------------

-- refresh_tag_graph(): owner-only. pg_cron runs as the table owner and keeps
-- working; anon can no longer trigger the multi-minute self-join + exclusive
-- lock on tag_pair_counts.
revoke execute on function public.refresh_tag_graph() from anon, authenticated, public;

-- tag_pair_counts (materialized view): reads are routed through the
-- SECURITY DEFINER tag_pairs(), so anon needs no direct SELECT. Belt-and-
-- suspenders against a future Supabase default-grant change.
revoke select on tag_pair_counts from anon, authenticated, public;


-- ---------------------------------------------------------------------------
-- F3: server-side LIMIT clamps. `create or replace` keeps the existing
-- signatures, so no drop/regrant dance and no PostgREST overload ambiguity.
-- Bodies are identical to docs/rpc.sql except for the clamped LIMIT lines.
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
    WHERE (p_year IS NULL OR (a.date >= make_date(p_year, 1, 1) AND a.date < make_date(p_year + 1, 1, 1)))
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
  LIMIT least(coalesce(p_top_k, 1000), 1000);
$$;


create or replace function host_counts(
  p_year int default null,
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[],
  p_top_k int default 50
)
returns table(host_id int8, name text, image_id int8, url text, n bigint)
language sql stable
as $$
  SELECT h.id, h.name, h.image_id, h.url, count(*)::bigint
  FROM albums a
  JOIN hosts h ON h.id = a.host_id
  WHERE (p_year IS NULL OR (a.date >= make_date(p_year, 1, 1) AND a.date < make_date(p_year + 1, 1, 1)))
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
  ORDER BY count(*) DESC
  LIMIT least(coalesce(p_top_k, 1000), 1000);
$$;


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
    WHERE t.category = COALESCE(p_category, t.category)
    GROUP BY t.name
    ORDER BY n DESC, t.name ASC
    LIMIT least(coalesce(p_top_k, 1000), 1000)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY n DESC, name ASC), '[]'::jsonb) FROM ranked;
$$;


create or replace function tag_pairs(
  p_category text default 'genre',
  p_top_k int default null
)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  WITH top_tags AS (
    SELECT t.id
    FROM tags t
    JOIN album_tags at ON at.tag_id = t.id
    WHERE t.category = COALESCE(p_category, t.category)
    GROUP BY t.id
    ORDER BY count(*) DESC, t.id ASC
    LIMIT least(coalesce(p_top_k, 1000), 1000)
  ),
  pairs AS (
    SELECT ta.name AS tag_a, tb.name AS tag_b, tpc.n::bigint AS n
    FROM tag_pair_counts tpc
    JOIN tags ta ON ta.id = tpc.tag_a_id
    JOIN tags tb ON tb.id = tpc.tag_b_id
    WHERE tpc.tag_a_id IN (SELECT id FROM top_tags)
      AND tpc.tag_b_id IN (SELECT id FROM top_tags)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(pairs) ORDER BY n DESC, tag_a ASC, tag_b ASC), '[]'::jsonb) FROM pairs;
$$;


create or replace function list_filtered_albums(
  p_include_tags text[] default array[]::text[],
  p_exclude_tags text[] default array[]::text[],
  p_before date default null,
  p_after date default null,
  p_limit int default 500,
  p_artist text default null,
  p_host_id int8 default null,
  p_year int default null
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
language plpgsql stable
as $$
#variable_conflict use_column
begin
  p_limit := least(coalesce(p_limit, 500), 1000);
  if cardinality(p_include_tags) > 0 then
    return query
      SELECT
        a.id, a.artist, a.title, a.url, a.date, a.art_id,
        h.id AS host_id, h.name AS host_name, h.image_id AS host_image_id, h.url AS host_url
      FROM (
        SELECT at.album_id
        FROM album_tags at JOIN tags t ON t.id = at.tag_id
        WHERE t.name = ANY(p_include_tags)
        GROUP BY at.album_id
        HAVING count(DISTINCT t.name) = cardinality(p_include_tags)
      ) inc
      JOIN albums a ON a.id = inc.album_id
      JOIN hosts h ON h.id = a.host_id
      WHERE
        (p_before  IS NULL OR a.date < p_before)
        AND (p_after   IS NULL OR a.date > p_after)
        AND (p_artist  IS NULL OR a.artist = p_artist)
        AND (p_host_id IS NULL OR a.host_id = p_host_id)
        AND (p_year    IS NULL OR (a.date >= make_date(p_year, 1, 1)
                                   AND a.date < make_date(p_year + 1, 1, 1)))
        AND (cardinality(p_exclude_tags) = 0 OR NOT EXISTS (
          SELECT 1 FROM album_tags at JOIN tags t ON t.id = at.tag_id
          WHERE at.album_id = a.id AND t.name = ANY(p_exclude_tags)
        ))
      ORDER BY a.date DESC
      LIMIT p_limit;
  else
    return query
      SELECT
        a.id, a.artist, a.title, a.url, a.date, a.art_id,
        h.id AS host_id, h.name AS host_name, h.image_id AS host_image_id, h.url AS host_url
      FROM albums a
      JOIN hosts h ON h.id = a.host_id
      WHERE
        (p_before  IS NULL OR a.date < p_before)
        AND (p_after   IS NULL OR a.date > p_after)
        AND (p_artist  IS NULL OR a.artist = p_artist)
        AND (p_host_id IS NULL OR a.host_id = p_host_id)
        AND (p_year    IS NULL OR (a.date >= make_date(p_year, 1, 1)
                                   AND a.date < make_date(p_year + 1, 1, 1)))
        AND (cardinality(p_exclude_tags) = 0 OR NOT EXISTS (
          SELECT 1 FROM album_tags at JOIN tags t ON t.id = at.tag_id
          WHERE at.album_id = a.id AND t.name = ANY(p_exclude_tags)
        ))
      ORDER BY a.date DESC
      LIMIT p_limit;
  end if;
end;
$$;


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
    limit least(coalesce(p_limit, 50), 100)
  ) x;
$$;


-- ---------------------------------------------------------------------------
-- Verify (run as anon, e.g. with a publishable-key client):
--   select refresh_tag_graph();              -- expected: permission denied
--   select * from tag_pair_counts limit 1;   -- expected: permission denied
--   select tag_pairs('genre', 999999);       -- returns at most C(1000,2) pairs
--   select jsonb_array_length(search_all('a', 999999));  -- <= 100
-- ---------------------------------------------------------------------------
