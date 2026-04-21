# Dungeon Synth Releases

A lightweight web app that aggregates dungeon synth releases from Bandcamp into a single browsable feed with cover art, tag filtering, and instant search.

## Pages

- **/** — Recent releases for the current year, newest first. Current day expanded by default; older days collapse to compact rows with a per-day show/hide covers toggle.
- **/releases/[year]** — Year archive. Same `ReleaseList` as `/` but all days start collapsed and the scroll hard-stops at Jan 1.
- **/genres** — Interactive force-directed graph of genre co-occurrence, with Louvain clustering and four selectable similarity metrics (Jaccard, PMI, cosine, raw). Canvas-rendered via `react-force-graph-2d`. See [docs/genres.md](docs/genres.md).
- **/themes** — Same component as `/genres`, fed by `category='theme'` in the `tags` table.
- **/stats** — All-time aggregate dashboard: releases-per-year bar, top hosts, track-count and duration histograms, popular genres + popular themes. See [docs/stats.md](docs/stats.md).

Past years, upcoming releases, and album / artist / host / day / tag detail views are **modal overlays driven by URL params** — no routed pages. See [docs/structure.md](docs/structure.md) for the routing model.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components, Cache Components) |
| Database | Supabase (PostgreSQL, RPC functions for aggregates) |
| Styling | Tailwind CSS v4 with CSS custom properties (10 themes) |
| Visualizations | `react-force-graph-2d` + d3 subpackages (force, scale, polygon, array) |
| Math rendering | KaTeX (similarity-metric formulas on /genres and /themes) |
| Hosting | Vercel (free tier) |
| Data pipeline | Python + uv + [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) |

## Features

- **Cache Components + ISR** — `"use cache"` + `cacheLife` on /stats, /genres, /themes, /past years index; `cacheTag("genres")` / `cacheTag("stats")` so a single revalidation bust refreshes the map after ingests. Vercel cron hits `/api/revalidate` daily to roll date labels (Today / Yesterday).
- **Command-palette search** — `SearchPalette` opened via ⌘K, `/`, or the header search trigger. Hits `/api/search` (pg_trgm across albums + artists, 50-row cap). Picking a result opens the album modal via `?album=<id>`.
- **URL-driven modals** — `ModalRouter` dispatches on `?album` / `?artist` / `?host` / `?genre` / `?xgenre` / `?day` / `?upcoming`. Helpers in `lib/modalUrl.ts`.
- **Scope modals with related-tag bars** — genre / theme modals render twin `TagBarScroll` columns: same-category on the left, other-category on the right. Data from `/api/albums/tag-context` (`lib/tagContext.ts`).
- **Tag filtering** — three-state toggles (include / exclude / neutral), URL-driven (`?tag=` / `?xtag=`). Server-side intersection via `list_filtered_albums` RPC. Clear-all-filters button.
- **Past-years picker** — hover-reveal grid of every year with releases (from `distinct_years` RPC), single-click to `/releases/[year]`.
- **Per-day cover toggle** — each `DaySection` has a show/hide covers toggle; `/` expands newest day, archive pages start all days collapsed.
- **10 color themes** — dark and light options, persisted in localStorage.
- **Cover image proxy** — Bandcamp images cached 1 week via Vercel edge; `/api/cover` enforces anti-hotlink referer + CSP.
- **Scroll descent** — page gradually darkens as you browse older releases.
- **Adjustable paper texture** — desaturated fractal noise overlay with opacity slider.
- **TagMap (`/genres`, `/themes`)** — canvas-rendered force graph with Louvain clustering, four similarity metrics (Jaccard / PMI / cosine / raw), top-N + density + min-links filters, PNG export, URL-driven state, live cluster-separation readout, param-sweep tool in `scripts/tune-tagmap.mts`.
- **Stats dashboard** — release-per-year bar, top 50 hosts, track-count & duration histograms, popular genres + popular themes columns.

## Setup

```bash
npm install
```

Create `.env.local` with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-key
CRON_SECRET=any-random-string
```

`CRON_SECRET` gates `/api/revalidate`. Vercel injects it as `Authorization: Bearer $CRON_SECRET` on the daily midnight cron (see `vercel.json`) that busts the layout cache for the "Today" / "Yesterday" labels. Set the same value in Vercel project env vars.

```bash
npm run dev
```

## Docs

- [docs/structure.md](docs/structure.md) — routing model, URL-driven modals, data loading strategy
- [docs/schema.md](docs/schema.md) — Supabase tables + RPC signatures
- [docs/rpc.sql](docs/rpc.sql) — full RPC bodies (source of truth for function logic)
- [docs/stats.md](docs/stats.md) — /stats page breakdown
- [docs/genres.md](docs/genres.md) — /genres + /themes TagMap pipeline
