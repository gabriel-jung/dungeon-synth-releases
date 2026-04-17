# Dungeon Synth Releases

A lightweight web app that aggregates dungeon synth releases from Bandcamp into a single browsable feed with cover art, tag filtering, and instant search.

## Pages

- **/** — Recent releases, newest first. Shows last 7 days initially, older releases load on scroll.
- **/upcoming** — Upcoming releases, sorted by date ascending. Next 7 days initially, further dates load on scroll.
- **/stats** — Aggregate stats for the current year: calendar heatmap of daily activity, top Bandcamp hosts, track-count and duration histograms. See [docs/stats.md](docs/stats.md).
- **/genres** — Interactive force-directed graph of genre co-occurrence, with Louvain clustering and four selectable similarity metrics (Jaccard, PMI, cosine, raw). See [docs/genres.md](docs/genres.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | Supabase (PostgreSQL, RPC functions for aggregates) |
| Styling | Tailwind CSS v4 with CSS custom properties (10 themes) |
| Visualizations | D3 (force simulation, scales, zoom, selection — subpackage imports) |
| Math rendering | KaTeX (for similarity-metric formulas on /genres) |
| Hosting | Vercel (free tier) |
| Data pipeline | Python + uv + [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) |

## Features

- **ISR** — pages cached for 1 hour, API responses for older albums cached 24h at the edge
- **Instant + server search** — local filtering on loaded albums, then server search across all ~3000 albums
- **Tag filtering** — three-state toggles (include/exclude/neutral), URL-driven
- **Date slider** — scrub through dates, auto-loads albums when navigating to unloaded dates
- **10 color themes** — dark and light options, persisted in localStorage
- **Cover image proxy** — Bandcamp images cached 1 week via Vercel edge
- **Scroll descent** — page gradually darkens as you browse older releases
- **Adjustable paper texture** — desaturated fractal noise overlay with opacity slider
- **Stats dashboard** — calendar heatmap, host ranking, track-count & duration histograms ([docs](docs/stats.md))
- **Genre graph** — D3 force-directed co-occurrence map with community clustering and tunable similarity metrics ([docs](docs/genres.md))
- **Artist/host modals** — clicking an artist or label name opens a modal with all their releases (grid or list); self-released artists resolve by UUID, label artists by name search
- **Tag modals** — clicking a tag on an album detail opens a genre modal showing all releases with that tag
- **Paginated grid view** — cover art grids load 20 at a time with a "load more" button

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

`CRON_SECRET` gates `/api/revalidate`. Vercel injects it as `Authorization: Bearer $CRON_SECRET` on the daily midnight cron (see `vercel.json`) that busts the layout cache for the "Today"/"Yesterday" labels. Set the same value in Vercel project env vars.

```bash
npm run dev
```
