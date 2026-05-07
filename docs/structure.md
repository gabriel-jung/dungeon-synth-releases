# Site structure

> **Status: reflects the shipped site as of 2026-05.**

## What this site is

A **chronicle** of dungeon synth releases, not an encyclopedia. The unit of meaning is the *release event* — what came out, when, tagged — not the artist's body of work. There are no artist bios, no lineups, no discographies. Data is not curated: releases are whatever Bandcamp said they were on that date.

This framing is load-bearing. It means:
- No entity *pages* (no `/artist/[x]`, no `/label/[x]`) — identity ambiguity stays invisible. Artists, hosts, and genres surface as **modal overlays** driven by URL params, not routed destinations.
- Year is the primary organizing axis.
- Everything else (tag, artist, label) is an attribute of a release, surfaced as a filter or modal.

## Data model

- **Year** — structural. Every release belongs to a year; the site is organized around years.
- **Release** — the atom. Shown as a card/row.
- **Tag** — filter value on the release list; clicking a tag on an album detail opens the genre scope modal.
- **Artist** — attribute of a release; clicking opens the artist scope modal with all their releases.
- **Host (label/page)** — Bandcamp host entity with a UUID; clicking opens the host scope modal scoped to that host's releases.

## Routes

```
/                    → Recent: current year, newest first
/releases/[year]     → year archive (list mode)
/graphs              → redirects to /graphs/genres
/graphs/genres       → all-time genre graph
/graphs/themes       → all-time theme graph (same component as /graphs/genres)
/statistics               → overall stats dashboard
/statistics/by-year       → per-year stats (placeholder)
```

Header: logo · search trigger (`SearchPalette` via ⌘K / `/` / click) · theme picker · about · TabBar (Releases / Statistics / Tag Graphs) · tag filter button (with `?` tooltip). Per-page sub-nav rows ((Recent / Past Years / Upcoming), (Overall / By Year), (Genres / Themes)) live in the page-specific layouts. Filter chips render absolute on the sub-nav row right side for `/` and `/statistics`; hidden on `/graphs/*`.

Past-years and upcoming-releases navigation live inside the releases area:
- `ReleasesScopeNav` renders **Recent · Past Years ▾ · Upcoming**.
- "Past Years" hover-picker lists every year with releases (from the `distinct_years` RPC); clicking a year navigates to `/releases/[year]`.
- "Upcoming" toggles `?upcoming=1` — upcoming releases render as a modal overlay on top of the current page, no route change.

## Modals are URL-driven

All modals are represented as URL params and dispatched centrally by `ModalRouter`:

| Param | Modal |
|-------|-------|
| `?album=<id>` | `AlbumDetail` |
| `?artist=<name>` | `ScopeModal` kind=artist |
| `?host=<id>` | `ScopeModal` kind=host |
| `?genre=<name>` (repeatable) | `ScopeModal` kind=genre — also used for theme tags; first value is the scope, subsequent values are inner intersections |
| `?xgenre=<name>` (repeatable) | inner exclusion inside the scope modal |
| `?day=YYYY-MM-DD` | `DayModal` (from the calendar heatmap popover) |
| `?upcoming=1` | `UpcomingModal` |

`lib/modalUrl.ts` centralises open/close/href transforms. `hrefWithModal(sp, kind, value, pathname)` is the canonical way components push modal state.

Genre/theme scope modals open with twin **related-tag bar plots** at the top (`TagContextBars` + `TagBarScroll`). Same-category sits on the left, other-category on the right — so a theme modal shows related themes left / related genres right, and vice versa for genres. Data comes from `/api/albums/tag-context` backed by `lib/tagContext.ts` (cached under the `genres` tag).

Page-level filters (`?tag=`, `?xtag=`) live alongside modal params but are owned by `TagFilter` / `FilterChips` in the root layout — not modal state.

## Page roles

### `/` — Recent (current year)

Main page under `app/(releases)/`. The release list scopes to the current year with hard stops at Jan 1 and today. Every day is a collapsible `DaySection`; the newest day with releases starts expanded (cover grid), older days collapse to compact rows with a per-day show/hide covers toggle.

- Global tag filter applies in place. URL reflects filter state.
- Clicking a tag on a release toggles it as a filter.
- Clicking an artist / host / tag opens the corresponding scope modal.

### `/releases/[year]` — year archive

Same `ReleaseList` component as `/`, but every day starts collapsed. `lowerBound={yearStart}` caps the scroll at Jan 1 of that year; the release list loads the first 500 rows descending from yearEnd to stay responsive on sparse pre-Bandcamp years.

### `/graphs/genres`, `/graphs/themes` — TagGraphs

Canvas-rendered force graphs over tag co-occurrence. Same `TagGraphCanvas` component, swapped between `category='genre'` and `category='theme'`. All-time only — per-year maps are too sparse to be meaningful. See [`docs/graphs.md`](./graphs.md).

### `/statistics` — stats dashboard

All-time aggregates — year bar, top hosts, tracks/duration histograms, popular genres + themes. See [`docs/statistics.md`](./statistics.md).

## Search

`SearchPalette` is a command-palette overlay. Opened via ⌘K, `/`, or the header search trigger — never a list filter. Typing ≥2 chars hits `/api/search` (`ilike` substring across artist/title/host name, 50-row cap, no title-dedupe). Picking a result opens the album detail modal via `?album=<id>`. No `?q=` URL param, no page-level search state.

## Calendar heatmap

Released as a popover attached to the year release count in the releases layout (`HeatmapPopoverButton` → `CalendarHeatmap`). Clicking a cell opens `DayModal` via `?day=YYYY-MM-DD`.

## What's not here

- No artist/label *pages* — they exist as modal overlays only
- No per-release detail pages — release info expands in a modal from its card
- No tag pages — tags are filters on the year view; genre modals are contextual overlays, not destinations
- No upcoming/past-years *pages* — both are modal / nested-route browses inside the releases area

If identity resolution ever becomes stable (stable artist IDs from source data, or a manual alias table), `/artist/[id]` can be added without reshuffling anything else.

## Data loading

Supabase free tier constrains both egress (5GB/month) and DB size (500MB). At current traffic, egress is well under limit; DB size is the one to watch as the corpus grows.

### Per-view strategy

- **Year archive** — query scoped to `WHERE year = X`. Cheap and bounded regardless of corpus size. Cached per year via Cache Components.
- **Genre map** — RPC aggregates across all `album_tags`; expensive to compute but small payload. Cached with `cacheLife("days")` and `cacheTag("genres")` + `cacheTag("tag-graph-{genre|theme}")`; the daily `?tag=genres` cron revalidates after ingests.
- **Stats** — same caching story (`cacheTag("stats")`, daily `?tag=stats` cron).
- **Tag filters** — routed through the `list_filtered_albums` RPC for server-side intersection; `/api/albums/by-scope` wraps it for the scope modal.

### Shared plumbing

- `lib/modalUrl.ts` — open/close/href helpers for URL-driven modal state
- `lib/albumCache.ts` — bounded module-level stub cache so modals can paint instantly from prior click data; server fetch still runs in parallel for authoritative data
- `lib/types.ts` — `AlbumListItem`, `parseTagParams`, `dedupeById`, `rpcRowToAlbumListItem`, …
- `lib/supabase.ts` — Supabase client, `ALBUM_LIST_SELECT`, `HTTP_CACHE_1H`, cached helpers (`fetchTagsByCategory`, `fetchPastYears`, `fetchYearCount`, `fetchRecentAlbums`)
- `lib/tagGraph.ts` — single-call `tag_counts` + `tag_pairs` (jsonb) for the `/graphs/genres` and `/graphs/themes` maps, cached under `cacheTag("genres")` + `cacheTag("tag-graph-{category}")`
- `lib/tagGraphLogic.ts` — shared graph construction (metrics, edge filter, Louvain) used by `TagGraphCanvas` and `scripts/tune-taggraph.mts`
- `lib/tagContext.ts` — per-tag related genres + themes for the scope modal bars, cached under the same `genres` tag
- `components/TagBarScroll.tsx` — shared vertically-scrolling bar list used by `/statistics` and the scope modal's tag-context panel

### Progressive disclosure on lists

List rows ship minimal fields (id, artist, title, date, primary tag). Rich fields (full tag list, duration, tracks) load on demand when a card expands or a modal opens. Keeps initial page lean.

Artwork is hotlinked directly from Bandcamp — no egress cost to us, no storage. Risk of hotlink blocking is low but non-zero; if it ever breaks, the fallback is a placeholder tile. Use plain `<img>` (not Next.js `<Image>`) so bytes don't flow through Vercel.

## Deferred decisions

- **Artist/label entity pages**: only once identity is stable.
- **Yearly filter on /statistics**: RPC args (`p_year`) are already nullable; missing piece is a year-picker UI component.
- **Hosting upgrade**: revisit if DB size crosses ~300MB or egress trends above ~3GB/month.
- **Artwork fallback strategy**: defer until Bandcamp hotlinking actually breaks.
