@AGENTS.md

# Project working notes

This file is the agent on-ramp for **dungeon-synth-releases**. AGENTS.md covers Next 16 rules; this file covers what's specific to this codebase.

## Read first

- [README.md](./README.md) — pages, stack, features, setup
- [docs/structure.md](./docs/structure.md) — routing model, URL-driven modals, what the site is *not* (no entity pages)
- [docs/schema.md](./docs/schema.md) + [docs/rpc.sql](./docs/rpc.sql) — Supabase tables + RPCs (read before writing SQL)
- [docs/graphs.md](./docs/graphs.md) — TagGraph pipeline (covers `/graphs/genres` + `/graphs/themes`)
- [docs/statistics.md](./docs/statistics.md) — `/statistics` dashboard
- [docs/roadmap.md](./docs/roadmap.md) — planned, undecided, parked
- [docs/rls-migration.sql](./docs/rls-migration.sql) — applied; kept as the source-of-truth record of the policies in production

## Load-bearing conventions

These are easy to violate by reflex. Don't.

- **No entity pages.** Artists, hosts, genres, themes, days, upcoming → all surface as URL-driven modal overlays. Add modal params to `lib/modalUrl.ts` + `ModalRouter`, never new routes. Exception only if stable artist IDs ever land.
- **No `next/image` for cover art.** Bandcamp art is hotlinked through plain `<img>` so bytes don't flow through Vercel egress. No image proxy.
- **Cache Components, not ad-hoc fetch caching.** `"use cache"` + `cacheLife("days")` + `cacheTag("genres")` (TagGraph, scope-modal tag bars, global tag filter list) / `cacheTag("stats")`. Two daily Vercel crons hit `/api/revalidate?tag=genres` and `?tag=stats` after upstream ingests. New cached data → pick an existing tag (or document a new one + add a cron entry).
- **JSONB single-row RPCs for big result sets.** PostgREST caps non-jsonb at 1000 rows. `tag_counts`, `tag_pairs`, `search_all` return `jsonb` arrays in one row to bypass the cap. Keep that pattern when adding aggregates that can exceed 1000.
- **Tag filters live in URL (`?tag=` / `?xtag=`)**, three-state include/exclude/neutral, intersected server-side via `list_filtered_albums`. Don't reimplement filtering client-side.
- **Plain words in user-facing copy.** No jargon ("jaccard", "PMI", "louvain", "weight") in tooltips, labels, headers. The math UI on `/graphs/genres` is the only place those terms appear, and they're paired with formulas + blurbs.
- **No artist/host detail without identity.** `hosts.id` is stable; artist names are *not*. Treat artist as a free-text attribute, never a key.

## Repo decoupling

The data scraper lives in a separate repo (`bandcamp-explorer-data`). **Don't** wire the two together — no shared imports, no cross-repo scripts. Schema changes happen in Supabase first; site reads from the live DB. If a feature needs scraper-side prep (e.g. geo map), call it out in `docs/roadmap.md` under the relevant entry, not in code.

## Where things live

```
app/(releases)/         /  and /releases/[year]
app/graphs/             /graphs (genres + themes sub-routes)
app/statistics/              /statistics (overall + by-year sub-routes)
app/api/                album, albums/{by-scope,tag-context}, daily, revalidate, search, upcoming, year-count, ...
components/             flat, no subdirs by feature
lib/
  modalUrl.ts           open/close/href helpers, canonical modal entry point
  supabase.ts           client + ALBUM_LIST_SELECT + cached helpers
                          (fetchTagsByCategory, fetchPastYears, fetchYearCount, fetchRecentAlbums)
  tagGraph.ts           jsonb tag_counts + tag_pairs fetch, cacheTag("genres") + cacheTag("tag-graph-{category}")
                          TAG_GRAPH_TOP_K=300, tag_pairs self-join times out unbounded at corpus scale
  tagGraphLogic.ts      graph construction shared by canvas + scripts/tune-taggraph.mts
  tagContext.ts         per-tag related-tag bars (scope modal)
  types.ts              AlbumListItem, parseTagParams, dedupeById, rpcRowToAlbumListItem,
                          tagFilterQs, yearFromPath, MONTH_NAMES
scripts/tune-taggraph.mts param-sweep tool against live data
```

## RPC migrations

`docs/rpc.sql` is the source-of-truth record. When the site code calls a new
RPC shape (e.g. `host_counts(..., p_top_k)` or `year_count`), the SQL must
be applied in Supabase **before** the deploy reaches users. PostgreSQL's
`create or replace function` only matches identical signatures — adding
a new parameter creates an overload PostgREST refuses to disambiguate.
Always `drop function if exists <name>(<old-arg-types>);` before recreating
when the signature changes.

## Next steps (priority order)

From `docs/roadmap.md`, in the order I'd tackle them:

1. **Geo map (`/map`)** — biggest user-visible win, blocked on scraper-side location cleanup. When `hosts.country_code` lands: phase 1 choropleth with `react-simple-maps` + Natural Earth topojson, click-through to the existing host `ScopeModal`. Don't add `/map` until the data is there — empty map is worse than no map.
2. **Tag category curation**, uneven `tags.category` quality is a known papercut. New `band` category (artist-as-tag) is the most likely concrete addition. When a new category lands, decide per-category: new TagGraph scope (a la `/graphs/themes`) or filter inside existing scopes. Don't invent categories from the site side.
3. **Recommendation engine ("similar artists")** — host tag-vector cosine, top-K per host precomputed in an RPC, surfaced inside the existing `ScopeModal`. Deferred until after geo map. Will need a min-release threshold to avoid noise from one-off hosts.
4. **Site shell / landing** — undecided. `/` drops straight into the feed; new visitors get no context. Candidates: about/methodology page, consistent cross-nav. Not a near-term itch.

Parked, don't propose: Louvain cluster browser, TagGraph polish (search-to-focus, share URLs), release-level artist/label graph. See roadmap.md for why.

## Deferred infra triggers

- **Hosting upgrade** — revisit if Supabase DB > ~300MB or egress > ~3GB/month.
- **Artwork fallback** — defer until Bandcamp hotlink-blocks. Placeholder tile is the fallback.
- **Year picker on `/statistics`** — RPC `p_year` args are already nullable; missing piece is UI.
- **Artist/label entity pages** — only when artist identity is stable (alias table or upstream IDs).

## Local commands

```bash
npm run dev         # Next 16 — Turbopack by default, output in .next/dev
npm run build       # production build
npm run lint        # eslint directly (next lint removed in v16)
npm run analyze     # next experimental-analyze, bundle inspection
npx tsx scripts/tune-taggraph.mts # TagGraph param sweep against live Supabase
```

`.env.local` needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (preferred — RLS-gated anon key) or `SUPABASE_SECRET_KEY` (legacy fallback), and `CRON_SECRET`. Same values mirrored in Vercel project env.
