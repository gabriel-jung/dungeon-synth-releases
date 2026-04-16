# Site structure

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
/                 → default year (latest, e.g. current year)
/[year]           → year archive
/genres           → all-time genre map
/stats            → all-time stats dashboard
/upcoming         → existing upcoming-releases page
```

Header: logo · year switcher · Genres · Stats.

## Page roles

### `/[year]` — year archive

The main page of the site. Contains:

- A lightweight visual header for the year's shape (month-grouped list with counts, or a quiet density ribbon — *not* a GitHub-style heatmap grid, which reads too "data dashboard").
- The release list, grouped by month.
- Filter chips (tags) applied **in place** on the current year. URL reflects filter state so it's shareable; no one reads the URLs, the chips are the interface.

Clicking a tag on a release toggles it as a filter on the current year's view. Clicking an artist or host name opens a modal overlay with their releases. Clicking a tag inside an album detail modal opens a genre modal.

### `/genres` — genre map

All-time, corpus-wide. Forces co-occurrence into a force-directed graph. Year filter not applied (per-year maps are too sparse/noisy to be meaningful).

### `/stats` — stats dashboard

Global, with per-plot year scoping where meaningful:
- **Evolution plots** (releases per year, new genres over time, cluster share): all-time, no filter.
- **Per-year plots** (releases per month, most active labels in a year): carry their own year picker.

### `/upcoming`

Unchanged. Existing page.

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
- **Search**: single full-text index on artist/title if/when list filtering proves insufficient.
- **Hosting upgrade**: revisit if DB size crosses ~300MB or egress trends above ~3GB/month.
- **Artwork fallback strategy**: defer until Bandcamp hotlinking actually breaks.
