# Dungeon Synth Releases

A lightweight web app that aggregates dungeon synth releases from Bandcamp into a single browsable feed with cover art, tag filtering, and instant search.

## Pages

- **/** — Recent releases for the current year, newest first. Last 7 days load first; older dates in the year load on scroll.
- **/past** — Grid of past years. Each tile links to its archive.
- **/past/[year]** — Year archive, list view of every day with per-day show/hide covers toggle. Same `ReleaseList` as `/` but all days start collapsed.
- **/upcoming** — Upcoming releases, sorted ascending. Flat list mode with date on each row.
- **/stats** — Aggregate stats for the current year: calendar heatmap of daily activity, top labels, track-count and duration histograms. See [docs/stats.md](docs/stats.md).
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

- **ISR** — home/upcoming/past pages revalidate every 1h, /stats, /genres, /past index every 6h, with a daily Vercel cron that busts the layout for date-label rollover. API responses set `s-maxage=3600, stale-while-revalidate=86400` (search route 5min/1h); cover proxy sets `max-age=1 week`.
- **Neutral search** — dropdown search across albums, artists, and labels backed by a `search_all` RPC with pg_trgm indexes (scales to 40k+ rows). Enter commits `?q=` as a current-year filter; hits in the dropdown open the album modal directly.
- **Clear-all-filters button** — one-tap wipe of `q`, `tag`, `xtag` (extensible to future facet keys).
- **Tag filtering** — three-state toggles (include/exclude/neutral), URL-driven
- **Past-year navigation** — "Past" tab hover reveals a multi-column year grid for single-click jumps to any archived year.
- **Per-day cover toggle** — every day section has a show/hide covers toggle; Recent starts the newest day expanded, past years start all days collapsed.
- **Date slider** — scrub through dates, auto-loads albums when navigating to unloaded dates
- **10 color themes** — dark and light options, persisted in localStorage
- **Cover image proxy** — Bandcamp images cached 1 week via Vercel edge
- **Scroll descent** — page gradually darkens as you browse older releases
- **Adjustable paper texture** — desaturated fractal noise overlay with opacity slider
- **Stats dashboard** — calendar heatmap, label ranking, track-count & duration histograms ([docs](docs/stats.md))
- **Genre graph** — D3 force-directed co-occurrence map with community clustering and tunable similarity metrics ([docs](docs/genres.md))
- **Artist/label modals** — clicking an artist or label name opens a modal with all their releases (grid or list), paginated 10 at a time with a "Show more" button. Self-released artists resolve by UUID, label artists by name search.
- **Tag modals** — clicking a tag on an album detail opens a genre modal showing all releases with that tag

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
