# /genres — Genre Co-occurrence Graph

An interactive [force-directed](https://en.wikipedia.org/wiki/Force-directed_graph_drawing) visualization of how genre tags tend to cluster and relate across the release catalogue. Nodes are genres, edges reflect co-occurrence on shared albums, and colors come from [community detection](https://en.wikipedia.org/wiki/Community_structure) run on the graph itself.

## Pipeline: from Bandcamp tags to the graph

### 1. Raw tags from Bandcamp

Every Bandcamp release is free-tagged by its artist. Data is collected via [bandcamp-explorer](https://github.com/gabriel-jung/bandcamp-explorer) and stored in `album_tags` (album_id ↔ tag_id join table) with tag names in `tags`.

### 2. Tag categorization

Raw tags mix many kinds of concepts — sonic genres, themes, instruments, locations, formats, labels, artist names, and more. A preselection step in the data pipeline classifies each tag and keeps only those identified as genres; the rest are set aside, so what ends up in the graph leans towards musical relationships rather than incidental co-tagging.

### 3. Counts and pairs (server)

Two RPCs aggregate from the filtered genre set:

- **`genre_counts`** — `(name, n)` per genre, where `n` is how many albums carry that tag.
- **`genre_pairs`** — `(tag_a, tag_b, n)` for each unordered pair of genres that co-occur on at least one album, with `n` the count of shared albums.

These are paginated to completion in `fetchAllPairs` (1000 rows per RPC call).

### 4. Graph construction (client)

Inside `GenreMap`:

- **Top-N filter** — only the N most popular genres enter the graph, controlled by a slider and numeric input.
- **Edge weighting** — four similarity metrics are available, each with a LaTeX-rendered formula and a short blurb:
  - **[Jaccard](https://en.wikipedia.org/wiki/Jaccard_index)** — `|A ∩ B| / |A ∪ B|` (default, fairly general)
  - **Raw** — `|A ∩ B|` (leans popular)
  - **[PMI](https://en.wikipedia.org/wiki/Pointwise_mutual_information)** — `log₂(|A ∩ B| · N / (|A| · |B|))` (surfaces surprising pairings)
  - **[Cosine](https://en.wikipedia.org/wiki/Cosine_similarity)** — `|A ∩ B| / √(|A| · |B|)` (more forgiving when sizes differ)
- **Min-links floor** — each node retains its top-K strongest edges, which helps avoid isolated nodes at sparse thresholds.
- **Density cap** — roughly the top X% strongest edges overall are rendered; the rest are dropped from paint but still feed the physics.
- **Community detection** — a [Louvain](https://en.wikipedia.org/wiki/Louvain_method) pass on the weighted graph gives cluster IDs. Each cluster gets its own hue, and a [convex hull](https://en.wikipedia.org/wiki/Convex_hull) (`d3-polygon`) is drawn around its members.

### 5. Physics & rendering

- A `d3-force` simulation with `forceLink`, `forceManyBody`, `forceCenter`, `forceCollide`, and a small cluster-attraction force.
- **Pre-warm** — a handful of ticks run before the first paint so nodes tend to appear near their final position rather than flying in.
- **Frame-skipped paint** — physics ticks at full rate while DOM updates happen roughly every other tick, which seems hard to notice for a settling graph and roughly halves the DOM work.
- **Visible edge subset** — only edges that pass density / ban filters get `<line>` elements; the full edge set still feeds the simulation so the overall shape is preserved.
- **Convex hulls** — recomputed every few ticks rather than every tick, joined by cluster id so mostly just the `d` attribute updates.
- **Zoom + drag** — scroll to zoom; drag nodes to pin them (dragging sets `fx`/`fy`).

## Interactions

- **Hover** a node → tooltip with genre name, album count, connection count.
- **Hover** an edge → tooltip with the two genres, shared album count, and similarity weight.
- **Click** a node → opens `GenreModal` with top albums tagged with that genre.
- **Search** (top bar) → substring match against visible genre names, highlighting matches in place. On this page the search stays on `/genres` rather than jumping to the release list — the URL is updated via `history.replaceState` and a `"search-change"` CustomEvent keeps components in sync. Neighbor expansion is reserved for explicitly clicked tags, so searching "punk" tends to highlight just the genre names containing "punk" (Egg Punk, Post-Punk, etc.) rather than everything connected to them.

## Controls panel

| Group | Controls |
|-------|----------|
| **Data** | Metric (Jaccard / Raw / PMI / Cosine), Top-N slider + numeric input, Density % slider, Min-links slider |
| **Layout** | Link length, Repulsion, Cohesion, Label position |
| **Appearance** | Node scale, Node opacity, Label size, Label limit |
| **View** | Reset zoom, export PNG |

State is URL-driven (`?metric=…&n=…&d=…&ml=…&lp=…`) so a given view can be shared.

## Performance notes

- Pre-warm + frame-skip help with perceived settling time and CPU use.
- The edge DOM is rebuilt with a keyed join (using a `WeakMap<Edge, string>` caching `"src|tgt"` keys), which helps preserve handlers across re-renders.
- `clickedTags` is kept separate from `hiTags` so search keystrokes don't re-trigger neighbor expansion.
- A `lowerNames` memo caches lowercased genre names per `counts` prop, so keystrokes iterate a stable array rather than re-lowercasing names each time.
- `d3` is imported by subpackage (`d3-force`, `d3-selection`, `d3-zoom`, …) instead of through the meta package, so only the modules actually used should end up in the bundle.

## Files

| Path | Role |
|------|------|
| `app/genres/page.tsx` | Server component: fetches `genre_counts` and all `genre_pairs`, hands them to `<GenreMap>` inside `<Suspense>` |
| `components/GenreMap.tsx` | Graph construction, physics, interaction, controls, rendering |
| `components/GenreModal.tsx` | Dialog with top albums for a clicked genre |

## Supabase RPCs

| Function | Returns |
|----------|---------|
| `genre_counts()` | `name, n` — one row per genre-category tag |
| `genre_pairs()` | `tag_a, tag_b, n` — unordered pairs of genres that co-occur, with shared album count |
