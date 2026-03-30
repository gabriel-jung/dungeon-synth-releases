# Dungeon Synth Releases

A lightweight web app that aggregates dungeon synth releases from Bandcamp into a single browsable feed with cover art, tag filtering, and instant search.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v4 with CSS custom properties (10 themes) |
| Hosting | Vercel (free tier) |
| Data pipeline | Python + uv + [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) |

## Setup

```bash
npm install
```

Create `.env.local` with your Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

```bash
npm run dev
```
