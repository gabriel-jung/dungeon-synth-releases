# Scaling Roadmap

Projected: 1.9k releases/year, 40k total. Original codebase sized at ~3k. This doc tracks what's been done and what's left as volume grows.

## Current deployed state

### Schema (as of migration)

All numeric ID columns are `bigint`:
- `albums.id`, `albums.host_id`, `albums.art_id`
- `hosts.id`, `hosts.image_id`
- `album_tags.album_id`

`tags.id` was already `int`. FKs recreated after migration. Frontend unchanged — PostgREST serializes `bigint` as JSON string, so `AlbumListItem.id: string` remains correct.

### Indexes live in Supabase

- `album_tags_pkey` — `(album_id, tag_id)` unique PK (built-in)
- `idx_album_tags_tag_album` — `(tag_id, album_id)` reverse covering index

### RPC live in Supabase

`list_filtered_albums(p_include_tags, p_exclude_tags, p_before, p_after, p_limit)` — full album rows with host join, filtered + ordered + limited server-side. Replaces the in-JS tag intersection that used to run in `app/page.tsx` and `api/albums/by-tags`.

Include/exclude checks use uncorrelated `in (subquery)` — the include set is built once via `group by album_id having count(distinct t.name) = cardinality(p_include_tags)`, and the exclude set is built once as a simple `distinct album_id` scan. Planner hash-semi-joins against albums. Avoids the per-album correlated subquery pattern that would walk the full date-ordered albums scan at scale.

Semantics:
- `p_before` strict `<` (to include today, pass tomorrow)
- `p_after` strict `>`
- `p_limit` per-page batch size; client drives pagination by passing edge date on next call

Callers:
- `app/page.tsx` — filtered first page
- `app/api/albums` — tag + cursor branch (infinite scroll)
- `app/api/albums/by-tags` — include-only, no cursor

## Open items

### Remaining indexes to add

Tier 1 still pending. Low risk, high impact.

```sql
create index if not exists idx_albums_date_desc
  on albums (date desc);

create index if not exists idx_albums_host_date
  on albums (host_id, date desc);

create extension if not exists pg_trgm;

create index if not exists idx_albums_artist_trgm
  on albums using gin (artist gin_trgm_ops);

create index if not exists idx_albums_title_trgm
  on albums using gin (title gin_trgm_ops);

analyze albums;
```

Speeds up: infinite scroll cursor, host pages, trigram search.

### Scraper cleanup (cosmetic)

`scripts/sync_to_supabase.py` still emits IDs as strings. Postgres coerces them on insert, so it works unchanged. Clean up when convenient:
- Cast `album_id`, `host_id`, `art_id`, `image_id` to `int` in upsert payloads
- Matches the post-migration column types, avoids a future surprise if a non-numeric value ever sneaks in

### Cache-targeted invalidation (needs scraper webhook)

`/api/revalidate` currently handles the midnight cron only (busts layout for date-label rollover). To trigger revalidation from the scraper after new inserts:

```ts
// in app/api/revalidate/route.ts
const tag = request.nextUrl.searchParams.get("tag")
if (tag) {
  revalidateTag(tag)
  return Response.json({ revalidated: tag })
}
revalidatePath("/", "layout")
```

Scraper POSTs `/api/revalidate?tag=albums` after a sync completes. Requires adding `cacheTag("albums")` to Supabase query layer — either via `cacheComponents: true` + `"use cache"` directive, or `fetch(..., { next: { tags: ["albums"] } })` wrappers (supabase-js doesn't integrate with fetch cache cleanly — awkward).

### `cacheComponents` migration

Deferred. Triggers to reconsider:
- Tag combinations multiply enough that ISR cache hit rate drops meaningfully (each `?tag=x&xtag=y` is a distinct entry)
- Scraper webhook exists to call `revalidateTag` (see above)
- Need fine-grained per-album invalidation

Migration touches:
- `next.config.ts` — `cacheComponents: true`
- All pages — drop `revalidate` exports, add `"use cache"` to cached functions
- `lib/supabase.ts` — wrap query helpers with `"use cache"` + `cacheLife("hours")` + `cacheTag("albums")`
- Components using `await searchParams` — split into uncached shell + cached child

Until a scraper webhook exists, ISR 1h + midnight cron is 90% as good.

### Longer-tail

- Rate-limit `/api/cover` (open image proxy)
- CSP + security headers via `next.config`
- Structured logging (replace `console.error` with a logger)
- Supabase read replicas if query load plateaus

## Bottlenecks by operation (reference)

| Operation | State | Notes |
|---|---|---|
| Home, no tags | OK | 7-day window, small regardless of scale |
| Home, with tag filter | OK | RPC + `(tag_id, album_id)` index |
| `/api/albums/by-tags` | OK | Same RPC |
| Infinite scroll (`/api/albums?before=...`) | Pending | Needs `idx_albums_date_desc` |
| `/api/albums/search` | Pending | Needs `pg_trgm` indexes |
| `/stats` RPCs | OK | Aggregates over year, existing indexes cover |
| `/genres` force sim | OK at 3k | Client-side D3; cap node count if tags explode later |
