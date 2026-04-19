# Site structure

> **Status: reflects the shipped site as of 2026-04.**

## What this site is

A **chronicle** of dungeon synth releases, not an encyclopedia. The unit of meaning is the *release event* — what came out, when, tagged — not the artist's body of work. There are no artist bios, no lineups, no discographies. Data is not curated: releases are whatever Bandcamp/Discogs said they were on that date.

This framing is load-bearing. It means:
- No entity *pages* (no `/artist/[x]`, no `/label/[x]`) — identity ambiguity stays invisible. Artists and hosts surface as modal overlays, not routed destinations.
- Year is the primary organizing axis.
- Everything else (tag, artist, label) is an attribute of a release, surfaced as a filter or modal.

## Data model

- **Year** — structural. Every release belongs to a year; the site is organized around years.
- **Release** — the atom. Shown as a card/row.
- **Tag** — filter value on the year view; clicking a tag on an album detail opens a genre modal.
- **Artist** — attribute of a release; clicking opens a modal with all their releases. Self-released = resolved by host UUID; label-released = resolved by name search across all labels.
- **Host (label/page)** — Bandcamp host entity with a UUID; clicking opens a host modal scoped to that host's releases.

## Routes

```
/                 → Recent: current year, newest first
/past             → grid of past years (index)
/past/[year]      → year archive (list mode, per-day toggle)
/upcoming         → upcoming releases across all future years
/genres           → all-time genre map
/stats            → all-time stats dashboard (per-year where meaningful)
```

Header: logo · search · theme picker · TabBar (Recent / Past / Upcoming / Stats / Genres) · per-year release count.

The "Past" tab opens the `/past` index on click; hovering reveals a multi-column year grid for direct jumps to any `/past/[year]`.

## Page roles

### `/` — Recent (current year)

Main page. The release list scopes to the current year with hard stops at Jan 1 and today. Every day is a collapsible `DaySection`; the newest day with releases starts expanded (cover grid), older days collapse to compact rows with a per-day show/hide covers toggle.

- Filter chips (tags) apply in place. URL reflects filter state.
- Clicking a tag on a release toggles it as a filter on the current year.
- Clicking an artist or host name opens a modal overlay with their releases.
- Clicking a tag inside an album detail opens a genre modal.

### `/past/[year]` — year archive

Same `ReleaseList` component as `/`, but every day starts collapsed. `lowerBound={yearStart}` caps the scroll at Jan 1 of that year; the release list loads the first 500 rows descending from yearEnd to stay responsive on sparse pre-Bandcamp years.

### `/past` — year index

Grid of tiles, one per year with releases (excluding the current year, which lives at `/`). Built from the `distinct_years` RPC.

### `/genres` — genre map

All-time, corpus-wide. Forces co-occurrence into a force-directed graph. Year filter not applied (per-year maps are too sparse/noisy to be meaningful).

### `/stats` — stats dashboard

Global, with per-plot year scoping where meaningful:
- **Evolution plots** (releases per year, new genres over time, cluster share): all-time, no filter.
- **Per-year plots** (releases per month, most active labels in a year): carry their own year picker.

### `/upcoming`

Unchanged. Existing page.

## Search

Search lives in the header as a dropdown lookup, not a list filter. Typing ≥2 chars queries the `search_all` Supabase RPC (pg_trgm indexes, 50-row cap) across albums, artists, and labels in one shot. Results open the album detail modal on click. Hitting Enter commits `?q=` as a current-year filter on the visible release list; `clear all filters` wipes `q`, `tag`, and `xtag` in one sweep.

On `/genres`, the dropdown is suppressed — typing drives node highlighting directly via the `?q=` param.

## What's not here

- No artist/label *pages* — they exist as modal overlays only
- No per-release detail pages — release info expands in a modal from its card
- No tag pages — tags are filters on the year view; genre modals are contextual overlays, not destinations

If identity resolution ever becomes stable (stable artist IDs from source data, or a manual alias table), `/artist/[id]` can be added without reshuffling anything else.

## Data loading

Supabase free tier constrains both egress (5GB/month) and DB size (500MB). At current traffic, egress is well under limit; DB size is the one to watch as the corpus grows 20x.

### Per-view strategy

- **Year archive** — query scoped to `WHERE year = X`. Cheap and bounded regardless of corpus size. Cached per year (ISR/revalidate).
- **Genre map** — RPC aggregates across all `album_tags`; expensive to compute but small payload. Cache aggressively (daily revalidate or cron-regenerated JSON). DB runs the aggregation once per day, not per visitor.
- **Stats** — same caching story as the map. Evolution plots are cached global; per-year plots are cached per year.
- **Tag filters** — the hard case. Too many combinations to cache comprehensively. Needs a proper DB-side intersection query (not paginate-then-intersect in the app) and indexes on `album_tags`.

### Progressive disclosure on lists

List rows ship minimal fields (id, artist, title, date, primary tag). Rich fields (full tag list, duration, tracks, description) load on demand when a card expands. Keeps initial page lean.

Artwork is hotlinked directly from Bandcamp — no egress cost to us, no storage. Risk of hotlink blocking is low but non-zero; if it ever breaks, the fallback is a placeholder tile. Use plain `<img>` (not Next.js `<Image>`) so bytes don't flow through Vercel.

## Deferred decisions

- **Artist/label entity pages**: only once identity is stable.
- **Hosting upgrade**: revisit if DB size crosses ~300MB or egress trends above ~3GB/month.
- **Artwork fallback strategy**: defer until Bandcamp hotlinking actually breaks.
