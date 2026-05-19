# /graphs/genres — Genre Co-occurrence Graph

An interactive [force-directed](https://en.wikipedia.org/wiki/Force-directed_graph_drawing) visualization of how genre tags cluster and relate across the release catalogue. Nodes are genres, edges reflect co-occurrence on shared albums, and colors come from [community detection](https://en.wikipedia.org/wiki/Community_structure) run on the graph itself. `/graphs/themes` is the same component fed by `category='theme'` instead of `'genre'`.

## Pipeline: from Bandcamp tags to the graph

### 1. Raw tags from Bandcamp

Every Bandcamp release is free-tagged by its artist. Data is collected via [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) and stored in `album_tags` (album_id ↔ tag_id join) with tag names in `tags`.

### 2. Tag categorization

Raw tags mix many kinds of concepts — sonic genres, themes, instruments, locations, formats, labels, artist names. A preselection step in the data pipeline classifies each tag and keeps only those identified as genres (or themes for `/graphs/themes`); the rest are set aside. What lands in the graph leans towards musical relationships rather than incidental co-tagging.

### 3. Counts and pairs (server)

Two RPCs aggregate from the filtered category set. Both **return `jsonb` in a single row**, so one HTTP call regardless of result size (PostgREST's 1000-row cap is bypassed):

- **`tag_counts(p_category default 'genre', p_top_k)`** — jsonb array of `{ name, n }`, where `n` is how many albums carry that tag. `p_top_k` caps to the K most-used tags; `NULL` = unbounded.
- **`tag_pairs(p_category default 'genre', p_top_k)`** — jsonb array of `{ tag_a, tag_b, n }` for each unordered pair of tags in the category that co-occur on at least one album. When `p_top_k` is set, pairs are restricted to those where both tags are among the top K (bounds the result at C(K,2)). Backed by the `tag_pair_counts` materialized view, so the read is an indexed scan, not a live self-join.

`fetchTagGraph` first queries `count(*) from tags where category = ...` (HEAD with `count=exact`), then passes that count as `p_top_k` to both RPCs so they cover every tag. For `/graphs/all` the count is hard-capped at `ALL_TOP_K` to keep the layout legible. All three calls are wrapped in `"use cache"` under `cacheTag("genres")` + `cacheTag("tag-graph-{category}")`, so the extra count round-trip is paid once per revalidation, not per visit.

The `tag_pairs` self-join is quadratic in tags-per-album: every album with `T` tags emits `C(T,2)` pair rows before the `GROUP BY` collapses them. Run per-request it timed out for `/graphs/all` on the free-tier vCPU. It is now precomputed into the `tag_pair_counts` materialized view, rebuilt once daily by `refresh_tag_graph()` scheduled via **pg_cron** at 00:00 UTC. pg_cron runs inside Postgres, so the multi-minute refresh is not bound by any Vercel function timeout. The `revalidate?tag=genres` Vercel cron is scheduled at 00:15, after the refresh, so the page cache repopulates from fresh data. Edge data is therefore up to a day stale, which matches the `cacheLife("days")` already on the graph.

### 4. Graph construction (client, shared logic)

Graph construction, metrics, edge filtering, and Louvain clustering live in `lib/tagGraphLogic.ts` (shared between `TagGraphCanvas` and the param-sweep tool in `scripts/tune-taggraph.mts`).

- **Top-N filter** — only the N most popular genres enter the graph, controlled by a slider and numeric input.
- **Edge weighting** — four similarity metrics are available, each with a LaTeX-rendered formula and a short blurb:
  - **[Jaccard](https://en.wikipedia.org/wiki/Jaccard_index)** — `|A ∩ B| / |A ∪ B|` (default, fairly general)
  - **Raw** — `|A ∩ B|` (leans popular)
  - **[PMI](https://en.wikipedia.org/wiki/Pointwise_mutual_information)** — `log₂(|A ∩ B| · N / (|A| · |B|))` (surfaces surprising pairings)
  - **[Cosine](https://en.wikipedia.org/wiki/Cosine_similarity)** — `|A ∩ B| / √(|A| · |B|)` (more forgiving when sizes differ)
- **Min-links floor** — each node retains its top-K strongest edges; avoids isolated nodes at sparse thresholds.
- **Density cap** — roughly the top X% strongest edges overall are rendered; the rest are dropped from paint but still feed the physics.
- **Community detection** — a [Louvain](https://en.wikipedia.org/wiki/Louvain_method) pass on the weighted graph gives cluster IDs. Each cluster gets its own hue, and a [convex hull](https://en.wikipedia.org/wiki/Convex_hull) (`d3-polygon`) is drawn around its members.

### 5. Physics & rendering (canvas)

`components/TagGraphCanvas.tsx` wraps [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph) — canvas-2D rendering on top of a `d3-force` simulation:

- **Forces** — `forceLink`, `forceManyBody`, `forceX`/`forceY` (centring that pulls outliers in — `forceCenter` didn't), `forceCollide`, plus a small cluster-attraction nudge.
- **Link distance auto-scales** with `√(nodeCount / 50)` so bigger graphs breathe.
- **Sync-settle in rAF** — physics ticks run ahead of the first paint so nodes land near their final position. Dragging pins via `fx`/`fy`.
- **Per-frame draw is pure canvas** — no DOM per node/edge, so pan/zoom stays smooth at 200+ nodes / 17k+ edges (the reason for moving off SVG).
- **Cached per settle** — hull geometry (`d3-polygon`) and label font strings computed once per layout settle, re-used during pan/zoom. No per-frame allocations.

## Interactions

- **Hover** a node → tooltip with genre name, album count, connection count.
- **Hover** an edge → tooltip with the two genres, shared album count, similarity weight.
- **Click** a node → pushes `?genre=<name>` (or `?genre=<name>` on `/graphs/themes` too — the `ScopeModal` handles both categories) and opens the shared scope modal.
- **Search** (top bar) → substring match against visible genre names, highlights in place. URL is updated via `history.replaceState` and a `"search-change"` CustomEvent keeps components in sync. No neighbor expansion from search — expansion is reserved for explicitly clicked tags. Searching "punk" highlights just the genre names containing "punk" (Egg Punk, Post-Punk), not everything connected to them.
- **Fullscreen**, **PNG export**, **arrow-pan / +− zoom** keyboard controls.

## Controls panel

Grouped **Filters / Display / Forces / Clustering / Advanced** to match the de-facto Obsidian graph-view vocabulary. Per-control **↺** reset, a global **Reset**, and a **↻ recompute-layout** button. A live read-out next to Link distance shows the measured inter/intra cluster-separation for the current layout.

| Group | Controls |
|-------|----------|
| **Filters** | Top-N, Min links / node, Edge density |
| **Display** | Node size, Node opacity, Label size, Label placement, Text fade, Focus on hover |
| **Forces** | Repel, Link force, Link distance, Center, Cohesion, Cluster repulsion |
| **Clustering** | Clustering on/off, Show hulls |
| **Advanced** (collapsed) | Metric (Jaccard / Raw / PMI / Cosine) |

Defaults live in `lib/tagGraphDefaults.ts` and are shared with `scripts/tune-taggraph.mts`, so the canvas and the param-sweep CLI agree on the same baseline.

State is URL-driven (`?m=…&n=…&d=…&ml=…&lp=…&c=…&sh=…&fh=…&lf=…&ld=…`) so views are shareable. Each param is omitted at its default so unshared URLs stay clean.

**Clustering toggle** — when off, Louvain is skipped, hulls are not drawn, and the cluster-cohesion / cluster-repulsion forces are inert. Useful for seeing the raw co-occurrence graph without community coloring.

**Text fade** — drives a zoom-opacity curve (Foam pattern): labels are invisible below the lower fade bound, smoothly interpolate to full opacity at the upper bound. Higher slider values shift both bounds down so labels appear at lower zoom levels.

**Focus on hover** — when on, hovering a node dims non-neighbours so the local neighbourhood pops. Toggle off for a static read of the whole graph.

## Performance notes

- Moving from SVG (`components/TagGraph.tsx`, removed) to canvas (`TagGraphCanvas.tsx`) was the main win — SVG was hitting layout + paint on every tick at 200+ nodes.
- Hull geometry and font strings are cached per settle; pan/zoom allocates nothing.
- `d3` imports are by subpackage (`d3-force`, `d3-polygon`, `d3-scale`, `d3-array`) so only the used modules land in the bundle.
- Settled positions + hull geometry are written to `sessionStorage` keyed by the graph-shape signature (`lib/useGraphPositionCache.ts`). Back-nav from a `ScopeModal` rehydrates instantly without re-settling.
- Clustering=off skips Louvain, hull build, and the two cluster forces, dropping ~30% of settle cost when the user only wants the raw graph.
- Zoom-driven label fade replaces a static per-frame px threshold — labels still cull below a fade lower-bound but interpolate smoothly through the band instead of popping in.
- Shared logic in `lib/tagGraphLogic.ts` lets `scripts/tune-taggraph.mts` reuse the exact same graph-construction / metric code as the page, and shared defaults in `lib/tagGraphDefaults.ts` keep both surfaces aligned.

## Files

| Path | Role |
|------|------|
| `app/graphs/genres/page.tsx` | Server component: fetches counts + pairs for `category='genre'`, renders `<TagGraphCanvas>` inside `<Suspense>` |
| `app/graphs/themes/page.tsx` | Same as above but `category='theme'` and `itemLabel="theme"` |
| `lib/tagGraph.ts` | `fetchTagGraph(category)` — single-call `tag_counts` + `tag_pairs` (jsonb), cached under `cacheTag("genres")` + `cacheTag("tag-graph-{category}")` |
| `lib/tagGraphLogic.ts` | Pure graph construction: metrics, edge filter, Louvain (gated by `clustering` arg), endpoint resolution, node/edge types |
| `lib/tagGraphDefaults.ts` | Shared `DEFAULTS` + URL param key map; imported by canvas and tune script |
| `lib/useTagGraphState.ts` | All control state + URL ↔ state sync (debounced `history.replaceState`) |
| `lib/useForceLayout.ts` | d3-force settle, hull cache, cluster forces; skips Louvain work when `clustering=false` |
| `lib/useGraphPositionCache.ts` | `sessionStorage` cache of settled positions + hulls, keyed by graph-shape signature |
| `components/TagGraphCanvas.tsx` | Orchestrator: composes hooks, renders sub-components + the search / zoom / fullscreen / PNG / share chrome |
| `components/TagGraphControls.tsx` | Settings overlay (Filters / Display / Forces / Clustering / Advanced groups) |
| `components/TagGraphRenderer.tsx` | `react-force-graph-2d` wrapper, paint callbacks, tooltips, zoom-fade, focus-on-hover, click-vs-drag |
| `components/TagGraphAbout.tsx` | About overlay + metric formulas (lazy-loads katex) |
| `components/ScopeModal.tsx` | Scope modal rendered when `?genre=<name>` is set (also handles themes) |
| `scripts/tune-taggraph.mts` | CLI param-sweep tool against the live data; uses `DEFAULTS` from `tagGraphDefaults` |

## Supabase RPCs

`tag_counts` + `tag_pairs` — see [`docs/schema.md`](./schema.md) for signatures, [`docs/rpc.sql`](./rpc.sql) for bodies.
