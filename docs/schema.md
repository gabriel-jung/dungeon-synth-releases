# Supabase Schema

> Snapshot as of 2026-06-10. Source of truth is the live Supabase project; this file mirrors it. Update the date and the affected sections when tables or RPCs change.
>
> Privileges (security pass, applied 2026-06-10): `tag_pair_counts` SELECT and `refresh_tag_graph()` EXECUTE are **revoked from anon** (reads go through the SECURITY DEFINER `tag_pairs`; the MV refresh runs only via pg_cron). Tag/list RPCs clamp their `p_top_k` / `p_limit` server-side. See [`docs/security-hardening.sql`](./security-hardening.sql).

## Tables

### `albums`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `int8` | PK |
| `artist` | `text` | |
| `title` | `text` | |
| `url` | `text` | Bandcamp URL |
| `art_id` | `int8` | Bandcamp cover art id → `f4.bcbits.com/img/a{art_id}_*.jpg` |
| `date` | `date` | Release date |
| `host_id` | `int8` | FK → `hosts.id` |
| `num_tracks` | `int4` | |
| `duration_sec` | `int4` | |

### `hosts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `int8` | PK |
| `name` | `text` | Label / artist page name |
| `url` | `text` | Bandcamp host URL |
| `image_id` | `int8` | Bandcamp avatar id |

### `tags`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `int4` | PK |
| `name` | `text` | Unique genre/tag name |
| `category` | `text` | Tag grouping |

### `album_tags` (junction)
| Column | Type | Notes |
|--------|------|-------|
| `album_id` | `int8` | FK → `albums.id` |
| `tag_id` | `int4` | FK → `tags.id` |

### `tag_pair_counts` (materialized view)
Precomputed tag co-occurrence; drives the `/graphs` edges via `tag_pairs`. Rebuilt daily by `refresh_tag_graph()` (pg_cron, 00:00 UTC). Indexed on `tag_a_id` and `tag_b_id`. Stores tag FK ids, not names; `tag_pairs` joins `tags` to resolve names on read.
| Column | Type | Notes |
|--------|------|-------|
| `tag_a_id` | `int4` | FK → `tags.id`, smaller id of the pair |
| `tag_b_id` | `int4` | FK → `tags.id`, larger id of the pair |
| `n` | `int4` | Albums carrying both tags |

## RPCs

Bodies live in [`docs/rpc.sql`](./rpc.sql) — table below is a signature index.

All tag-filtered RPCs accept `p_include_tags text[]` (album must have ALL) and `p_exclude_tags text[]` (album must have NONE). `p_year` args are nullable: `null` = all-time, `int` = that year.

| Function | Args | Returns |
|----------|------|---------|
| `tag_counts(p_category, p_top_k)` | category default `'genre'`; optional top-K cap | **`jsonb`** — array of `{ name, n }` in a single row (bypasses PostgREST 1000-row cap) |
| `tag_pairs(p_category, p_top_k)` | category default `'genre'`; optional top-K cap restricts pairing to top-K tags | **`jsonb`** — array of `{ tag_a, tag_b, n }` unordered co-occurrence pairs in a single row. Reads the `tag_pair_counts` MV (SECURITY DEFINER) |
| `refresh_tag_graph()` | — | `void` — rebuilds the `tag_pair_counts` MV (SECURITY DEFINER; called daily by pg_cron) |
| `distinct_years()` | — | `year, n` — every year with releases + count (callers ignore `n`) |
| `year_counts(p_include_tags, p_exclude_tags)` | tag filters | `year, n` — per-year release counts |
| `host_counts(p_year, p_include_tags, p_exclude_tags, p_top_k)` | year-scoped; `p_top_k` default 50 | `host_id, name, image_id, url, n` |
| `daily_counts(p_year, p_include_tags, p_exclude_tags)` | year-scoped | `date, n` |
| `year_count(p_year, p_up_to, p_include_tags, p_exclude_tags)` | scalar count for year, optional date ceiling | **`bigint`** — single value |
| `tracks_per_album_hist(p_year, p_include_tags, p_exclude_tags)` | year-scoped | `bucket, bucket_order, bucket_width, n` |
| `album_duration_hist(p_year, p_include_tags, p_exclude_tags)` | year-scoped | same shape as tracks hist |
| `dow_counts(p_year, p_include_tags, p_exclude_tags)` | year-scoped; zero-padded via `generate_series` | same shape as tracks hist (7 bins, Mon..Sun) |
| `month_counts(p_year, p_include_tags, p_exclude_tags)` | year-scoped; zero-padded via `generate_series` | same shape as tracks hist (12 bins, Jan..Dec) |
| `list_filtered_albums(p_include_tags, p_exclude_tags, p_before, p_after, p_limit)` | keyset pagination | album row list |
| `tag_counts_by_category(p_category, p_year, p_include_tags, p_exclude_tags, p_top_k)` | category + year-scoped (null = all-time); `p_top_k` default 50 | `name, n` |
| `search_all(p_q, p_limit)` | substring search over artist/title/host name; `p_limit` default 50 | **`jsonb`** — array of matching album rows, newest first. No title-dedupe (label + self-release both surface) |
