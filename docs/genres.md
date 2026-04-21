# /genres — Genre Co-occurrence Graph

An interactive [force-directed](https://en.wikipedia.org/wiki/Force-directed_graph_drawing) visualization of how genre tags cluster and relate across the release catalogue. Nodes are genres, edges reflect co-occurrence on shared albums, and colors come from [community detection](https://en.wikipedia.org/wiki/Community_structure) run on the graph itself. `/themes` is the same component fed by `category='theme'` instead of `'genre'`.

## Pipeline: from Bandcamp tags to the graph

### 1. Raw tags from Bandcamp

Every Bandcamp release is free-tagged by its artist. Data is collected via [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) and stored in `album_tags` (album_id ↔ tag_id join) with tag names in `tags`.

### 2. Tag categorization

Raw tags mix many kinds of concepts — sonic genres, themes, instruments, locations, formats, labels, artist names. A preselection step in the data pipeline classifies each tag and keeps only those identified as genres (or themes for `/themes`); the rest are set aside. What lands in the graph leans towards musical relationships rather than incidental co-tagging.

### 3. Counts and pairs (server)

Two RPCs aggregate from the filtered category set. Both **return `jsonb` in a single row**, so one HTTP call regardless of result size (PostgREST's 1000-row cap is bypassed):

- **`tag_counts(p_category default 'genre', p_top_k)`** — jsonb array of `{ name, n }`, where `n` is how many albums carry that tag. `p_top_k` caps to the K most-used tags; `NULL` = unbounded.
- **`tag_pairs(p_category default 'genre', p_top_k)`** — jsonb array of `{ tag_a, tag_b, n }` for each unordered pair of tags in the category that co-occur on at least one album. When `p_top_k` is set, pairs are restricted to those where both tags are among the top K — bounds the result at C(K,2) and keeps the self-join over a small tag set.

`fetchTagMap` passes `p_top_k = TAG_MAP_TOP_K` (300) to both and parses the single jsonb row client-side. Cached with `"use cache"` under `cacheTag("genres")`.

### 4. Graph construction (client, shared logic)

Graph construction, metrics, edge filtering, and Louvain clustering live in `lib/tagMapLogic.ts` (shared between `TagMapCanvas` and the param-sweep tool in `scripts/tune-tagmap.mts`).

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

`components/TagMapCanvas.tsx` wraps [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph) — canvas-2D rendering on top of a `d3-force` simulation:

- **Forces** — `forceLink`, `forceManyBody`, `forceX`/`forceY` (centring that pulls outliers in — `forceCenter` didn't), `forceCollide`, plus a small cluster-attraction nudge.
- **Link distance auto-scales** with `√(nodeCount / 50)` so bigger graphs breathe.
- **Sync-settle in rAF** — physics ticks run ahead of the first paint so nodes land near their final position. Dragging pins via `fx`/`fy`.
- **Per-frame draw is pure canvas** — no DOM per node/edge, so pan/zoom stays smooth at 200+ nodes / 17k+ edges (the reason for moving off SVG).
- **Cached per settle** — hull geometry (`d3-polygon`) and label font strings computed once per layout settle, re-used during pan/zoom. No per-frame allocations.

## Interactions

- **Hover** a node → tooltip with genre name, album count, connection count.
- **Hover** an edge → tooltip with the two genres, shared album count, similarity weight.
- **Click** a node → pushes `?genre=<name>` (or `?genre=<name>` on `/themes` too — the `ScopeModal` handles both categories) and opens the shared scope modal.
- **Search** (top bar) → substring match against visible genre names, highlights in place. URL is updated via `history.replaceState` and a `"search-change"` CustomEvent keeps components in sync. No neighbor expansion from search — expansion is reserved for explicitly clicked tags. Searching "punk" highlights just the genre names containing "punk" (Egg Punk, Post-Punk), not everything connected to them.
- **Fullscreen**, **PNG export**, **arrow-pan / +− zoom** keyboard controls.

## Controls panel

Grouped Data / Physics / Edges / Display, with per-control **↺** reset, a global **Reset**, and a **↻ recompute-layout** button. A live read-out shows the measured cluster-separation for the current layout.

| Group | Controls |
|-------|----------|
| **Data** | Metric (Jaccard / Raw / PMI / Cosine), Top-N |
| **Physics** | Cluster spacing, Overall scale, Centring, Edge stiffness |
| **Edges** | Density %, Min-links |
| **Display** | Node scale, Node opacity, Label size, Label min size, Label limit, Label position |

State is URL-driven (`?metric=…&n=…&d=…&ml=…&lp=…`) so views are shareable.

## Performance notes

- Moving from SVG (`components/TagMap.tsx`, removed) to canvas (`TagMapCanvas.tsx`) was the main win — SVG was hitting layout + paint on every tick at 200+ nodes.
- Hull geometry and font strings are cached per settle; pan/zoom allocates nothing.
- `d3` imports are by subpackage (`d3-force`, `d3-polygon`, `d3-scale`, `d3-array`) so only the used modules land in the bundle.
- Shared logic extraction into `lib/tagMapLogic.ts` lets the param-sweep tool (`scripts/tune-tagmap.mts`) reuse the exact same graph-construction / metric code as the page.

## Files

| Path | Role |
|------|------|
| `app/genres/page.tsx` | Server component: fetches counts + pairs for `category='genre'`, renders `<TagMapCanvas>` inside `<Suspense>` |
| `app/themes/page.tsx` | Same as above but `category='theme'` and `itemLabel="theme"` |
| `lib/tagMap.ts` | `fetchTagMap(category)` — single-call `tag_counts` + `tag_pairs` (jsonb), cached under `cacheTag("genres")` |
| `lib/tagMapLogic.ts` | Shared graph construction: metrics, edge filter, Louvain, endpoint resolution, node/edge types |
| `components/TagMapCanvas.tsx` | Canvas-2D renderer (react-force-graph-2d), controls, interactions, PNG export, fullscreen |
| `components/ScopeModal.tsx` | Scope modal rendered when `?genre=<name>` is set (also handles themes) |
| `scripts/tune-tagmap.mts` | CLI param-sweep tool against the live data |

## Supabase RPCs

| Function | Returns |
|----------|---------|
| `tag_counts(p_category text default 'genre', p_top_k int default null)` | `jsonb` — array of `{ name, n }` |
| `tag_pairs(p_category text default 'genre', p_top_k int default null)` | `jsonb` — array of `{ tag_a, tag_b, n }` |

See [`docs/rpc.sql`](./rpc.sql) for bodies.
