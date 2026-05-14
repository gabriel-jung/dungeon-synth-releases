# Roadmap

Loose backlog of planned work. Not a commitment, not ordered strictly by priority.

## Planned

### Geographic map (`/map`)
World map of artists/hosts by location. Strong scenes in US, Poland, Germany, Brazil, France — visualising that is genuinely interesting and orthogonal to the existing tag/release views.

**Prereq (scraper side, `bandcamp-explorer-data`):**
- Clean the already-scraped location strings — currently mixed granularity (sometimes city, sometimes country, sometimes fictional).
- Normalise to at least `country_code` (ISO 3166-1 alpha-2). Add `lat/lng`, `admin1`, `city`, `location_raw`, `geocode_status` if feasible.
- Geocoding via Nominatim (rate-limited, cache per-string).

**Schema (site-side, `hosts` table):**
```
country_code   text         -- minimum
admin1         text         -- optional
city           text         -- optional
lat, lng       numeric      -- for dot mode
location_raw   text         -- audit trail
geocode_status text         -- ok | failed | fictional | blank
```

**Site implementation:**
- `/map` route.
- Phase 1: choropleth by `country_code` (`react-simple-maps` + Natural Earth topojson). Works with country-only data.
- Phase 2: dot overlay once lat/lng populated.
- Click-through reuses existing `ScopeModal` (host kind) — no new modal infra.

### Tag category curation
Attribution quality in `tags.category` is uneven. User is exploring/curating manually in the scraper repo.

Example of planned addition: **`band` category** for tags that are literally artist/project names (common bandcamp convention: users tag releases with related bands). Keeps those tags out of the `/graphs/genres` and `/graphs/themes` maps.

If new categories land, the site may need either:
- A new TagGraph scope (analogous to `/graphs/genres`, `/graphs/themes`), or
- A filter in existing scopes to exclude them.

Decide on a per-category basis.

### Recommendation engine ("similar artists")
Host tag vectors + cosine similarity → "similar to" suggestions. Surface inside existing `ScopeModal` (album/artist/host kinds) rather than a new page.

**Depends on:**
- Enough signal per host (filter to hosts with ≥ N releases).
- New RPC: precompute top-K neighbours per host, cache.

Deferred — not needed before geo map work.

**Tag denormalisation (consider in conjunction):**
When the vector layer lands, also evaluate adding a denormalised `albums.tag_ids int[]` column + GIN index. The two are orthogonal tools, not alternatives:

- Tag vector / pgvector solves **similarity ranking**: cosine over host (or album) tag-profile vectors. Powers "similar to" + clustering.
- `tag_ids[]` + GIN solves **set membership**: `@>` for "must contain ALL", `&&` for "intersects ANY". Powers the existing tag filter on `/statistics`, `/releases/[year]`, and `list_filtered_albums`.

The current filter path (`album_tags` junction + `IN (SELECT … GROUP BY HAVING count(DISTINCT) = …)`) can still trip Supabase's `statement_timeout` under heavy filters (e.g. multi-tag includes intersected against the full corpus). The sargable date rewrite + progressive Suspense rendering (see `docs/statistics.md`) already absorb most of the cold-load failure cases on the unfiltered path. Filtered cold-load on rare combos can still be slow. A vector index won't fix that (wrong operator). A GIN over `tag_ids[]` would (typical 10-100× speedup on set-membership queries).

Cost is modest (~1 day total):
1. SQL: add column, GIN index, backfill from `album_tags`.
2. Scraper (`bandcamp-explorer-data/scripts/sync_to_supabase.py`): attach `tag_ids` to album rows during the existing upsert (junction table stays authoritative; the array is a denormalised read-mirror). No trigger needed if Python writes it explicitly.
3. Rewrite the 8 filtered RPCs in `docs/rpc.sql` to use `tag_ids @> inc_ids` / `tag_ids && exc_ids` instead of the aggregating subquery. Signatures unchanged; site code untouched.

Order: SQL migration first (forward-compatible — column with empty default), then scraper change (populates new rows), then RPC rewrites (reads switch over). Each step independently reversible.

Skip until the reco engine work brings the vector layer into scope or filtered stats become a primary UX path (today they're a power-user surface and the per-chunk degraded + retry pattern keeps the page functional under partial RPC failure).

## Undecided

### Site shell
Right now `/` drops straight into the release feed — no onboarding for new visitors. Candidates:
- Landing / about / methodology page explaining data source + how tag graphs are built.
- Consistent cross-nav between `/`, `/graphs/genres`, `/graphs/themes`, `/statistics`, `/releases`.
- Not yet prioritised.

## Parked / rejected

- **Louvain cluster browser** — expose communities from `lib/tagGraphLogic.ts` as browsable "subgenre families". Rejected: feels more like a paper/blog post than a useful site feature. Clusters are already used for node colour, which is enough.
- **TagGraph polish** (search-to-focus, per-map filters, share URLs) — not a current itch.
- **Release-level artist/label graph** — too many nodes, not compelling; host-level aggregation is what becomes the reco engine above.
