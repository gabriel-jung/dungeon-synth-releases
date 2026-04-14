# /stats — Release Statistics

A dashboard of aggregate views over the current year's releases. Server-rendered with `revalidate = 3600` (1 hour cache).

## Sections

### 1. Daily Release Activity — calendar heatmap

A GitHub-style grid: one cell per day of the current year, coloured by number of releases.

- **Quantile binning** — 9 colour buckets derived from the non-zero distribution at percentiles `[0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.9, 0.95]`. Adapts to any year's scale instead of a fixed threshold.
- **Three palettes** — `theme` (follows current color theme), `inferno`, `viridis`. Swapped in place without re-render of surrounding content.
- **Month banding** — subtle outlines around each month's cells for visual grouping.
- **Today marker** — current day is outlined.
- **Future cells** — days past today are rendered dimmed.
- **Hover** — shows date + release count in a caption.
- **Click** — opens `DayModal` listing that day's releases.

### 2. Most Active Pages — top Bandcamp hosts

Ranked list of the top 50 Bandcamp host pages by year-to-date release count.

- `HostRow` displays image thumbnail, name, count, and a proportional bar (width relative to the top host's count).
- Scrollable with a soft bottom mask (mask-image fade) so the list cuts off gracefully at ~12 rows without a visible scrollbar.
- Clicking a row links out to the Bandcamp page.

### 3. Tracks per Release — histogram

Distribution of album track counts. Server-computed bucket widths (e.g. `1`, `2`, `3-4`, `5-7`, …) with density-aware bars: height is `count / bucket_width` so wide buckets aren't artificially tall.

- Hover zone extends to a floor of 10% of max so tiny bars remain targetable.
- Hover caption shows `{bucket} — {n} releases`.

### 4. Release Duration — histogram

Same `Histogram` component, fed a different RPC. Buckets cover album duration ranges.

## Data flow

All four sections hydrate from one parallel Supabase batch:

```ts
const [hostRes, dailyRes, tracksHistRes, durationHistRes] = await Promise.all([
  supabase.rpc("host_counts",            rpcArgs),
  supabase.rpc("daily_counts",           rpcArgs),
  supabase.rpc("tracks_per_album_hist",  rpcArgs),
  supabase.rpc("album_duration_hist",    rpcArgs),
])
```

`rpcArgs = { p_year, p_include_tags, p_exclude_tags }` — tag filtering flows from the URL (`?tag=…&xtag=…`) via `parseTagParams(sp)` and is applied at the SQL level for each aggregate.

## Files

| Path | Role |
|------|------|
| `app/stats/page.tsx` | Server component, issues the 4 parallel RPC calls, shapes data |
| `components/CalendarHeatmap.tsx` | Year heatmap with palette picker, hover tooltip, day modal trigger |
| `components/DayModal.tsx` | Dialog showing the releases for a clicked day |
| `components/HostRow.tsx` | Single ranked host entry with bar |
| `components/Histogram.tsx` | Density-aware bar chart with hover zones |

## Supabase RPCs

| Function | Returns |
|----------|---------|
| `host_counts(p_year, p_include_tags, p_exclude_tags)` | `host_id, name, image_id, url, n` |
| `daily_counts(p_year, p_include_tags, p_exclude_tags)` | `date, n` |
| `tracks_per_album_hist(p_year, p_include_tags, p_exclude_tags)` | `bucket, bucket_order, bucket_width, n` |
| `album_duration_hist(p_year, p_include_tags, p_exclude_tags)` | same shape as above |
