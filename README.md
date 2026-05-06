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
| Data pipeline | Python + uv + [bandcamp-explorer-data](https://github.com/gabriel-jung/bandcamp-explorer-data) |

## Features

- **URL-driven modals** — album / artist / host / genre / theme / day / upcoming all surface as overlays driven by query params (`ModalRouter` + `lib/modalUrl.ts`). No entity routes.
- **Three-state tag filter** — include / exclude / neutral chips, URL-persisted (`?tag=` / `?xtag=`), server-side intersection via the `list_filtered_albums` RPC.
- **Command-palette search** — `SearchPalette` opened via ⌘K, `/`, or the header trigger. Hits `/api/search` (`ilike` substring across artist/title/host name, 50-row cap).
- **TagMap on `/genres` and `/themes`** — canvas force graph with Louvain clustering, four similarity metrics, top-N / density / min-links filters, PNG export, shareable URL state. See [docs/genres.md](docs/genres.md).
- **Stats dashboard** — releases-per-year bar, top hosts, track / duration histograms, popular genres + themes. See [docs/stats.md](docs/stats.md).
- **Cache Components + ISR** — `"use cache"` + `cacheLife("days")` + `cacheTag("genres")` (TagMap, scope-modal tag bars, global tag filter list, year count, recent feed) / `cacheTag("stats")`. Two daily Vercel crons hit `/api/revalidate` to bust each tag after upstream ingests (see `vercel.json`).
- **Hotlinked cover art** — album art served direct from Bandcamp via plain `<img>` (zero Vercel egress, no `next/image`).
- **10 color themes**, scroll descent, adjustable paper texture. Pre-hydration script in `<head>` stamps the saved theme synchronously so non-default themes don't flash the default on cold load.
- **UX polish** — top-of-page progress bar on every soft nav, skeleton frames for deep-linked album modal + heatmap popover, sr-only skip-to-content link.

## Setup

```bash
npm install
```

Create `.env.local` with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
CRON_SECRET=any-random-string
```

The site reads `SUPABASE_PUBLISHABLE_KEY` (anon role, RLS-gated — see [`docs/rls-migration.sql`](docs/rls-migration.sql)) and falls back to `SUPABASE_SECRET_KEY` for legacy environments. RLS migration is applied in production.

`CRON_SECRET` gates `/api/revalidate`. Vercel injects it as `Authorization: Bearer $CRON_SECRET` on two daily midnight crons (see `vercel.json`) that bust the `genres` and `stats` cache tags after upstream ingests. Set the same value in Vercel project env vars.

```bash
npm run dev
```

## Docs

- [DESIGN.md](DESIGN.md) — visual system spec (palette, typography, components, sigil iconography)
- [docs/structure.md](docs/structure.md) — routing model, URL-driven modals, data loading strategy
- [docs/schema.md](docs/schema.md) — Supabase tables + RPC signatures
- [docs/rpc.sql](docs/rpc.sql) — full RPC bodies (source of truth for function logic)
- [docs/stats.md](docs/stats.md) — /stats page breakdown
- [docs/genres.md](docs/genres.md) — /genres + /themes TagMap pipeline
- [docs/roadmap.md](docs/roadmap.md) — planned, undecided, parked work
