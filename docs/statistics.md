# /statistics — Release Statistics

A dashboard of aggregate views over all known dungeon synth releases. Server-rendered with Next.js Cache Components (`"use cache"` + `cacheLife("days")` + `cacheTag("stats")`). Cron calls `/api/revalidate?tag=stats` to push new data after ingests.

Sub-routes: `/statistics` (Overall, this doc) and `/statistics/by-year` (placeholder, "Coming soon"). Sub-nav lives in `app/statistics/layout.tsx`; filter chips render absolute on the right of that row.

## Sections

### 1. Releases per Year — full-width bar plot

Every year from 1990 to the current year as one bar. Empty years are shown with a zero bar so gaps are visible. Uses the shared `Histogram` component.

### 2. Most Active Pages — top Bandcamp hosts (all-time)

Ranked list of the top 50 hosts by lifetime release count (labels and self-published artists alike — the site doesn't distinguish).

- `HostRow` shows name, count, and a proportional bar.
- Scrollable with a soft bottom mask (mask-image fade) so the list cuts off gracefully at ~12 rows without a visible scrollbar.
- Clicking a row opens the shared `ScopeModal` on `?host=<id>` with the full host release list.

### 3. Tracks per Release — histogram

Distribution of album track counts across the entire corpus. Server-computed buckets (`1`…`10`, `11-12`, `13-15`, `16-20`, `21+`) with density-aware bars: height is `count / bucket_width` so wide buckets aren't artificially tall.

### 4. Release Duration — histogram

Same `Histogram` component, fed a different RPC. Buckets cover album duration ranges.

### 5. Popular Genres / Popular Themes — top tag rows

Two `TagBarScroll` columns side by side. Each reads the top 50 tags in its category via `tag_counts_by_category(p_category, p_year: null, …)` — genre on the left, theme on the right. Clicking a row opens the shared `ScopeModal` on `?genre=<name>`. The same `TagBarScroll` powers the related-tag panel inside the scope modal itself.

## Filter

The global tag filter (`?tag=…&xtag=…`) in the site header applies to every stats RPC. All six RPCs accept `p_include_tags` and `p_exclude_tags`, so filtered views recompute server-side.

## Calendar heatmap

The calendar heatmap is **not** on this page. It lives in a popover invoked from the release-list header (`HeatmapPopoverButton` → `CalendarHeatmap`), fed by `/api/daily` (`daily_counts` RPC).

## Data flow

One parallel Supabase batch inside a `"use cache"` boundary:

```ts
const filterArgs   = { p_include_tags, p_exclude_tags }
const allTimeArgs  = { p_year: null, ...filterArgs }

const [hostRes, yearRes, tracksHistRes, durationHistRes, genreRes, themeRes] = await Promise.all([
  supabase.rpc("host_counts",            allTimeArgs),
  supabase.rpc("year_counts",            filterArgs),
  supabase.rpc("tracks_per_album_hist",  allTimeArgs),
  supabase.rpc("album_duration_hist",    allTimeArgs),
  supabase.rpc("tag_counts_by_category", { p_category: "genre", p_year: null, ...filterArgs }),
  supabase.rpc("tag_counts_by_category", { p_category: "theme", p_year: null, ...filterArgs }),
])
```

Passing `p_year: null` tells every RPC to skip the year filter — if/when a UI year picker is added, swap to `p_year: selectedYear` and the cache key takes care of itself.

`currentYear` lives **outside** the `"use cache"` boundary: only the `yearBins` fill-loop uses it, and keeping it out means year rollover doesn't invalidate cached RPC data.

## Files

| Path | Role |
|------|------|
| `app/statistics/page.tsx` | Server component, issues the 6 parallel RPC calls, renders sections |
| `components/HostRow.tsx` | Single ranked host entry with bar; opens `ScopeModal` via `?host=` |
| `components/TagRow.tsx` | Single ranked tag entry with bar; opens `ScopeModal` via `?genre=` |
| `components/TagBarScroll.tsx` | Shared scrollable tag bar column, also used by the scope modal's tag-context panel |
| `components/Histogram.tsx` | Density-aware bar chart with hover zones |

## Supabase RPCs

`year_counts`, `host_counts`, `tracks_per_album_hist`, `album_duration_hist`, `tag_counts_by_category` — see [`docs/schema.md`](./schema.md) for signatures, [`docs/rpc.sql`](./rpc.sql) for bodies.
