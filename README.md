# Dungeon Synth Releases

A lightweight web app that aggregates dungeon synth releases from Bandcamp into a single browsable feed with cover art, tag filtering, and instant search.

## Pages

- **/** — Recent releases, newest first. Shows last 7 days initially, older releases load on scroll.
- **/upcoming** — Upcoming releases, sorted by date ascending. Next 7 days initially, further dates load on scroll.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v4 with CSS custom properties (10 themes) |
| Hosting | Vercel (free tier) |
| Data pipeline | Python + uv + [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) |

## Features

- **ISR** — pages cached for 1 hour, API responses for older albums cached 24h at the edge
- **Instant + server search** — local filtering on loaded albums, then server search across all ~3000 albums
- **Tag filtering** — three-state toggles (include/exclude/neutral), URL-driven
- **Date slider** — scrub through dates, auto-loads albums when navigating to unloaded dates
- **10 color themes** — dark and light options, persisted in localStorage
- **Cover image proxy** — Bandcamp images cached 1 week via Vercel edge

## Setup

```bash
npm install
```

Create `.env.local` with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-key
```

```bash
npm run dev
```
