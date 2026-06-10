# /statistics — Release Statistics

A dashboard of aggregate views over all known dungeon synth releases. Each chapter is its own async server component inside a `<Suspense>` boundary, with its own `"use cache" + cacheLife("days") + cacheTag("stats", "stats:<chapter>")` data fetcher. Cron calls `/api/revalidate?tag=stats` after ingests to invalidate every chapter at once.

Sub-routes: `/statistics` (Overall, this doc) and `/statistics/by-year/[year]` (per-year breakdown, see [By Year](#by-year) below). Sub-nav lives in `app/statistics/layout.tsx` as `Overall · <year> ▾`. The year token is a hover dropdown (`StatsScopeNav` → `YearDropdown`) populated from `fetchPastYears()` plus the current year, mirroring the `Past years` dropdown in `ReleasesScopeNav`. Filter chips render absolute on the right of that row.

Directly below the scope nav, the layout renders the shared `YearReleaseCount` widget (`mode="stats"`) wired to `fetchTotalCount()` for its initial value. The widget reads `usePathname` and:

- on `/statistics` shows the unfiltered all-time count, or refetches `/api/total-count` when a tag filter is active.
- on `/statistics/by-year/<year>` fetches `/api/year-count?year=<year>` and displays "N releases in YEAR".

Both endpoints honour `?tag=` / `?xtag=`. `yearFromPath` matches both `/releases/<y>` and `/statistics/by-year/<y>` so the same path-aware components work across both areas.

## Sections

Eight chapters numbered I–VIII. Each is its own server component (`components/StatsChapters.tsx`) wrapped in `<Suspense>` with a chapter-specific skeleton (`components/StatsSkeleton.tsx`).

| Chapter | Title | RPC | Cache sub-tag | Used on |
|---|---|---|---|---|
| I (all-time) | Releases per Year | `year_counts` | `stats:years` | `/statistics` |
| I (by-year) | Daily Release Activity | `daily_counts` | `stats:heatmap` | `/statistics/by-year/[year]` |
| II | Releases by Day of Week | `dow_counts` | `stats:dow` | both |
| III | Releases by Month | `month_counts` | `stats:month` | both |
| IV | Most Active Pages | `host_counts` | `stats:hosts` | both |
| V | Tracks per Release | `tracks_per_album_hist` | `stats:tracks` | both |
| VI | Release Duration | `album_duration_hist` | `stats:duration` | both |
| VII | Popular Genres | `tag_counts_by_category('genre', …)` | `stats:genres` | both |
| VIII | Popular Themes | `tag_counts_by_category('theme', …)` | `stats:themes` | both |

Clicks on hosts/genres/themes open the shared `ScopeModal` via the existing modal URL params.

## Filter

The global tag filter (`?tag=…&xtag=…`) in the site header applies to every chapter's RPC. Filtered combos are independent cache entries (the filter arrays are part of each `"use cache"` boundary's key), so they recompute server-side without invalidating the unfiltered cache.

## Rendering model

Progressive Suspense streaming: each chapter resolves independently and streams its HTML into place as the RPC completes. One slow chapter no longer blanks the page.

Failure isolation via a local `safe()` wrapper (`components/StatsChapters.tsx`): the cached fetcher inside `"use cache"` strict-throws on RPC error so the failure isn't persisted; `safe()` catches the throw outside the cache boundary, logs, and returns `null`. The chapter renders `ChunkDegraded` (a client island with a retry form) instead of the chart. The other seven chapters render normally.

This intentionally avoids constructing JSX inside `try/catch`: the React Compiler's `react-hooks/error-boundaries` rule forbids that because render errors propagate past synchronous try/catch. Pattern is:

```tsx
const bins = await safe("DowChapter", () => fetchDow(filter))
if (bins === null) return <ChunkDegraded chapter="II" title="…" tag="stats:dow" />
return <Histogram chapter="II" title="…" bins={bins} />
```

## Per-chunk retry

Each `ChunkDegraded` renders a form whose action is a bound Server Action (`lib/stats-actions.ts → retryStatsChunk(tag)`). The action validates `tag` against an allow-list of known chunk tags (so a hostile form post can't flush arbitrary cache tags) and calls `updateTag(tag)`. `updateTag` is Next 16's read-your-writes primitive: the RSC re-render triggered by the form post immediately sees fresh data. `revalidateTag` is the wrong primitive here, it only marks stale for *future* requests, so the very render the user is waiting on would still serve cached/empty data. Only the invalidated chunk re-fetches; the other seven serve from cache.

`useFormStatus()` drives a "Retrying…" pending label so users see the round-trip and can't hammer Supabase via double-clicks.

## Calendar heatmap

On the Overall page the heatmap lives in a popover invoked from the release-list header (`HeatmapPopoverButton` → `CalendarHeatmap`), fed by `/api/daily` (`daily_counts` RPC). The by-year page renders `CalendarHeatmap` inline as chapter I (see below), fed server-side from the same `daily_counts` RPC under cache tag `stats:heatmap`.

## By Year

`/statistics/by-year/[year]` mirrors the Overall page year-scoped, with chapter I (releases-per-year bar plot) replaced by an inline `CalendarHeatmap` of daily release activity for that year.

- Year switching: the scope nav's `By year ▾` token (in `app/statistics/layout.tsx`) becomes a hover dropdown listing the current year + every past year. Active year shown in the label; clicking an option navigates to `/statistics/by-year/<y>`.
- The index route `/statistics/by-year` redirects to the current year.
- Year validation: `1990 ≤ year ≤ currentYear`, otherwise `notFound()`.
- All chapters run with `p_year: year` inside their `"use cache" + cacheLife("days")` boundary. The cache key includes the year, so each year + filter combination caches independently and the daily `?tag=stats` revalidate busts all of them at once.
- `today` is computed outside the cache boundary so year-rollover doesn't invalidate cached RPC data (only the heatmap's future-vs-past highlight depends on it).

## Performance

Two design choices keep cold-load fast under Supabase free-tier CPU steal:

1. **Sargable year filter.** Every RPC that filters by year uses `a.date >= make_date(p_year, 1, 1) AND a.date < make_date(p_year + 1, 1, 1)` rather than `extract(year FROM a.date) = p_year`. The first form uses the btree on `albums.date`; the second forces a seq scan. See the header in `docs/rpc.sql`. Required index:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date);
   ```
2. **Progressive fan-out.** Each chapter has its own RPC + cache boundary. Cold-load streams as each chapter resolves; a single slow chapter no longer fails the whole page via `Promise.all` rejection.

A monolithic `stats_all` consolidated RPC was rejected: stats may evolve, and a shared SQL body would couple every chapter change to a function migration.

## Files

| Path | Role |
|------|------|
| `app/statistics/layout.tsx` | Loads past years + total count, renders `StatsScopeNav` + filter chips + `YearReleaseCount` |
| `app/statistics/page.tsx` | Overall page. Orchestrates chapter components inside `StatsLayout` + Suspense |
| `app/statistics/by-year/page.tsx` | Index route, redirects to current year |
| `app/statistics/by-year/[year]/page.tsx` | Per-year page. Same chapters with `HeatmapChapter` in chapter I |
| `app/statistics/loading.tsx`, `.../by-year/[year]/loading.tsx` | Initial full-page skeletons (default `StatsSkeleton` export) |
| `components/StatsLayout.tsx` | Slot-based shell with chapter grid + dividers |
| `components/StatsChapters.tsx` | Per-chapter async server components + their `"use cache"` fetchers |
| `components/StatsSkeleton.tsx` | Default full-page skeleton + per-chapter named exports for Suspense fallbacks |
| `components/ChunkDegraded.tsx` | Client island: degraded state + retry form (`useFormStatus`) |
| `lib/stats-actions.ts` | Server Action: `retryStatsChunk(tag)` validates tag against allow-list + `updateTag` (read-your-writes; see Per-chunk retry above) |
| `lib/stats.ts` | Shared types (`StatsFilter`, `HostCount`, `YearRow`, etc.), `unwrap` (strict), `toBins`, `toHostCounts`, `toTagCounts`, `emptyMsg`, `YEAR_LOWER_BOUND` |
| `components/StatsScopeNav.tsx` | Client scope nav with the hover-dropdown `YearDropdown`, mirrors `ReleasesScopeNav` |
| `components/HostRow.tsx` | Single ranked host entry with bar; opens `ScopeModal` via `?host=` |
| `components/TagRow.tsx` | Single ranked tag entry with bar; opens `ScopeModal` via `?genre=` |
| `components/TagBarScroll.tsx` | Shared scrollable tag bar column, also used by the scope modal's tag-context panel |
| `components/Histogram.tsx` | Density-aware bar chart with hover zones |
| `components/CalendarHeatmap.tsx` | Reused inline on the by-year page as chapter I |

## Supabase RPCs

`year_counts`, `host_counts`, `tracks_per_album_hist`, `album_duration_hist`, `tag_counts_by_category`, `daily_counts` (by-year chapter I only), `dow_counts`, `month_counts` — see [`docs/schema.md`](./schema.md) for signatures, [`docs/rpc.sql`](./rpc.sql) for bodies.
