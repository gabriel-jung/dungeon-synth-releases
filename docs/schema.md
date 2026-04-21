# Supabase Schema

Snapshot of public schema as used by this site. Source of truth is the live Supabase project; this file mirrors it for reference. Update when tables or RPCs change.

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

## RPCs

Bodies live in [`docs/rpc.sql`](./rpc.sql) — table below is a signature index.

All tag-filtered RPCs accept `p_include_tags text[]` (album must have ALL) and `p_exclude_tags text[]` (album must have NONE). `p_year` args are nullable: `null` = all-time, `int` = that year.

| Function | Args | Returns |
|----------|------|---------|
| `tag_counts(p_category, p_top_k)` | category default `'genre'`; optional top-K cap | **`jsonb`** — array of `{ name, n }` in a single row (bypasses PostgREST 1000-row cap) |
| `tag_pairs(p_category, p_top_k)` | category default `'genre'`; optional top-K cap restricts pairing to top-K tags | **`jsonb`** — array of `{ tag_a, tag_b, n }` unordered co-occurrence pairs in a single row |
| `distinct_years()` | — | `year, n` — every year with releases + count (callers ignore `n`) |
| `year_counts(p_include_tags, p_exclude_tags)` | tag filters | `year, n` — per-year release counts |
| `host_counts(p_year, p_include_tags, p_exclude_tags)` | year-scoped | `host_id, name, image_id, url, n` |
| `daily_counts(p_year, p_include_tags, p_exclude_tags)` | year-scoped | `date, n` |
| `tracks_per_album_hist(p_year, p_include_tags, p_exclude_tags)` | year-scoped | `bucket, bucket_order, bucket_width, n` |
| `album_duration_hist(p_year, p_include_tags, p_exclude_tags)` | year-scoped | same shape as tracks hist |
| `list_filtered_albums(p_include_tags, p_exclude_tags, p_before, p_after, p_limit)` | keyset pagination | album row list |
| `tag_counts_by_category(p_category, p_year, p_include_tags, p_exclude_tags, p_top_k)` | category + year-scoped (null = all-time); `p_top_k` default 50 | `name, n` |
