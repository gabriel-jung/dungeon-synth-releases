# /list — Shareable list builder

A Topsters-style builder: search dungeon synth releases, arrange them in a grid (or ranked list), and download the result as a PNG or share it by link. One tool page (like `/about`), **not** an entity page.

## What it is

- Search → add releases → arrange → **Download PNG** / **Copy link**.
- The whole chart (items + every layout option) is encoded in the URL, so a link reproduces the exact list. No server-side persistence.
- A 1-item story-shaped chart doubles as a single-album share card.

## State lives in the URL (`?d=`)

`lib/listCodec.ts` packs the full `ChartState` into one compressed param:

```
/list?d=<base64url( gzip( JSON(ChartState) ) )>
```

`encodeState` / `decodeState` use the native `CompressionStream` (browser + Node, no dep). `decodeState` returns `emptyState()` on any malformation, and `sanitizeState` clamps every field (a `?d=` blob is attacker-controllable). `ChartState`:

| Field | Meaning |
|-------|---------|
| `items` | ordered album ids (decimal strings; int8 can exceed `MAX_SAFE_INTEGER`) |
| `cols`, `rows` | grid dimensions; `cols×rows` = visible slot count (`chartCapacity`) |
| `gap` | 0–24; drives both the inter-cover gap **and** the outer margin |
| `bg` | backdrop preset (`theme`/`black`/`parchment`/`bone`) or `#rrggbb` |
| `aspect` | output shape, see `ASPECTS` (`square`, `portrait45`, `portrait916`, `landscape43`, `landscape169`) |
| `coverSize` | 1–5, 5 = autofit covers to fill the frame; lower shrinks them (`COVER_FRACS`) |
| `anchor` | `topleft` (margin = gap) or `center` (centred, ignores gap for edges) |
| `numbered` / `numberText` | rank number on the cover badge / prefixed in the caption text |
| `textPos` | `top`/`bottom` (caption under/over cover) or `left`/`right` (side text list) |
| `textSize`, `textAlign`, `wrap` | caption font scale (1–5, `textScale`), alignment, wrap vs clip |
| `footer` | show the "Dungeon Synth Releases" wordmark |
| `showTitle/showArtist/showLabel/showDate` | caption fields |
| `title` | chart title |

The builder syncs state → `?d=` via `replaceState` (debounced, no history spam) **merging** other params so an open modal (`?album=`) survives. A localStorage draft (`ds-list-draft-v1`) restores the last chart on a bare `/list`.

## Shared layout math (preview == export)

`measureChart(state, count, tile, availW?)` is the single source of layout truth, consumed by **both** the in-app preview (DOM) and the PNG route (Satori), so they can never drift. It returns cell/grid/content dimensions and caption font sizes for a given tile.

- `chartTile(state, count, W, H)` — largest tile whose content fits the fixed canvas (content scales ~linearly in tile, so it probes once at tile=1000 and divides), reserving a **gap-sized edge** so the outer margin equals the inter-cover gap. `coverSize` then shrinks it.
- `chartEdge(state, tile)` — the outer margin (= the gap) for a tile.
- `aspectCanvas(aspect)` — fixed PNG dimensions per shape (square 1080², portrait 1080×1350 / 1080×1920, landscape 1440×1080 / 1920×1080).
- `resolveBg` / `chartInk` — backdrop colour + legible title/caption ink for that backdrop (a light parchment backdrop needs dark ink even on a dark site theme).

### Two layout families

- **Caption under/over cover** (`textPos` top/bottom): each grid cell = cover + caption, aligned by `textAlign`.
- **Side text list** (`textPos` left/right): a covers-only grid + a **single numbered text-list column** beside it. List rows align to grid rows (block of `cols` captions per row). A row grows to `max(cover, text-block height)` so dense columns get space between rows instead of overlapping.

## Preview is true WYSIWYG

`components/ListBuilder.tsx` renders the **exact** export layout at the export tile, then `transform: scale()`s it to fit. Scale is anchored so a 100% caption renders at the release-feed size (0.8rem); box height is bounded by a scroll container (capped to the settings panel / viewport) instead of shrinking the text. The preview box width follows the chosen shape.

Interactions (preview only, not baked into the PNG):
- **Drag and drop** covers to reorder (desktop; touch uses the ← → buttons), plus per-tile move/remove on hover.
- **Clickable captions** open the album detail modal (`useOpenModal` → `?album=`), seeded via `cacheAlbumStub`.

## Export — `app/api/list/image/route.tsx`

`next/og` `ImageResponse` (Cinzel woff, same as `app/opengraph-image.tsx`). Fixed canvas per shape; content fitted + anchored top-left (margin = gap) or centred. Covers pulled at 700px (`coverUrl(..,"xl")`). Title crest is a **drawn diamond** (Cinzel has no `⟡` glyph and Satori has no system fallback). Long captions clip (ellipsis) or wrap. `Content-Disposition: attachment`. Satori is a flexbox subset (no CSS grid) — the grid is `flexWrap` at a fixed cell width.

## Data

- `app/api/albums/by-ids/route.ts` — batch album fetch (rate-limited, CSV ids, capped at `MAX_ITEMS`).
- `lib/supabase.ts → fetchAlbumsByIds` — order-preserving (`in()` doesn't preserve order); used by the page (SSR hydrate) + the image route.

## Files

| Path | Role |
|------|------|
| `app/list/page.tsx` | Server: decode `?d=`, fetch albums, render builder |
| `components/ListBuilder.tsx` | Client island: controls, preview, sync, DnD, modal open, export/share buttons |
| `components/ListSearchAdd.tsx` | Search-to-add box (stays open behind a modal) |
| `lib/listCodec.ts` | `ChartState`, encode/decode, `sanitizeState`, `measureChart`/`chartTile`/`chartEdge`/`fitCanvas`, `aspectCanvas`, `resolveBg`/`chartInk`, `textScale` |
| `app/api/list/image/route.tsx` | PNG export via `next/og` |
| `app/api/albums/by-ids/route.ts` | Batch album fetch |

## Not done (deferred)

- CSV import; per-item ratings/notes; touch drag-and-drop; social-unfurl per list (the `opengraph-image` convention can't read query params, so a shared `/list?d=` link unfurls the generic site card — the in-app Download is the share artifact).
