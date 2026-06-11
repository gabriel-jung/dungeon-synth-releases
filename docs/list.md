# /list — Shareable list builder

A Topsters-style builder: search dungeon synth releases, arrange them in a grid (or ranked list), and download the result as a PNG or share it by link. One tool page (like `/about`), **not** an entity page.

## What it is

- Search → add releases → arrange → **Download PNG** / **Copy link**.
- The whole chart (items + every layout option) is encoded in the URL, so a link reproduces the exact list. No server-side persistence.
- A 1-item story-shaped chart doubles as a single-album share card (the **Card** quick layout).

## View mode vs edit mode

A `/list?d=` link opens as a **read-only shared view**: the chart fitted to the viewport (both dimensions, any screen), plus [Edit this list] [Download image] [Copy link] and a "make your own" link. No settings column, no drag handles, no per-tile buttons; captions still open the album modal. [Edit] swaps the builder in without navigation.

Author detection: if the URL `d` equals the localStorage draft's `d`, the visitor is the author reloading their own link and goes straight to the builder. While in view mode the draft is **never** overwritten (viewing someone's list must not clobber your own work in progress).

## Quick layouts + mobile defaults

Three preset buttons at the top of the settings (each a one-tap `patch`, everything stays adjustable after):

- **Grid**: 5×5, captions under covers, square. The desktop default.
- **List**: 1 column, captions beside covers (side text), 9:16. Rows grow to the item count (capped at `MAX_ROWS`).
- **Card**: 1×1, caption below, 9:16. Player-style single-album share card.

First visit on a touch device (`pointer: coarse`, no draft, no `?d=`) defaults to the List shape instead of the grid.

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
| `aspect` | output shape, see `ASPECTS`. Default `auto` hugs the content (canvas = covers, no dead space, `autoCanvas`); the fixed frames (`square`, `portrait45`, `portrait916`, `landscape43`, `landscape169`) fit the content into a predictable social-media size |
| `coverSize` | 1–5, 5 = autofit covers to fill the frame; lower shrinks them (`COVER_FRACS`) |
| `anchor` | `center` (default, centred in the frame) or `topleft` (margin = gap) |
| `numbered` / `numberText` | rank number on the cover badge / prefixed in the caption text |
| `textPos` | `top`/`bottom` (caption under/over cover) or `left`/`right` (side text list) |
| `textSize`, `textAlign`, `wrap` | caption font scale (1–5, `textScale`), alignment, wrap vs clip |
| `footer` | show the "Dungeon Synth Releases" wordmark (off by default) |
| `showTitle/showArtist/showLabel/showDate` | caption fields |
| `title` | chart title |

The builder syncs state → `?d=` via `replaceState` (debounced, no history spam) **merging** other params so an open modal (`?album=`) survives. A localStorage draft (`ds-list-draft-v1`) is offered as an explicit "Resume last list" entry on a bare `/list` (no auto-load); an empty session never overwrites it, so it stays resumable.

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

`components/ListBuilder.tsx` renders the **exact** export layout at the export tile, then `transform: scale()`s it to fit.

- **Desktop builder**: the whole canvas fits the column (width AND height, capped to the settings panel / viewport) so the chosen shape always reads true. The caption anchor (100% caption = release-feed 0.8rem) is a ceiling so text never renders oversized; tall frames may shrink captions below it.
- **Mobile builder + view mode (any screen)**: the whole canvas is fitted to the viewport in both dimensions. Shape fidelity wins over caption legibility everywhere.

Mobile builder layout: preview first, settings below; the Layout / Text / Footer groups are collapsible (open by default on desktop, collapsed on mobile via CSS until toggled, so hydration agrees on every device).

Interactions (preview only, not baked into the PNG):
- **Drag and drop** covers to reorder (desktop; touch uses the ← → buttons, always visible via `pointer-coarse:` and counter-scaled against the canvas `scale()` so they stay tappable), plus per-tile move/remove on hover.
- **Clickable captions** open the album detail modal (`useOpenModal` → `?album=`), seeded via `cacheAlbumStub`.

## Sharing

- **Per-list social unfurl**: `generateMetadata` on the page reads `?d=` and points `og:image` at the PNG route (with the chart title + release count), so a shared link unfurls as the actual chart. (The `opengraph-image` file convention can't read query params, but `generateMetadata` can.)
- **Native share**: a `navigator.share` button (feature-detected after mount) opens the share sheet; **Copy image** writes the PNG to the clipboard (`ClipboardItem` promise form, so Safari's in-gesture rule holds). The share block sits under the preview (the settings column is much taller).
- **Title is always one line**: `titleFontSize` shrinks the font to fit the content width (estimated, Satori can't measure text) with ellipsis as backstop, because `measureChart` budgets a single line and a wrapped title overflows the canvas (clipping covers in centered layouts).
- **Theme backdrop fidelity**: the preview resolves the "Theme" backdrop from CSS vars; the client passes the concrete hex to the PNG route as `?bg=` (honoured only when the state says `theme`) so the download matches the preview.

## Add to list from anywhere + saved lists

`lib/listDraft.ts` owns localStorage:

- `addToList(album)` backs the **"+ List"** button in the album modal on every page. It dispatches a cancelable `ds-list-add` event; an editing builder claims it (preventDefault) and updates its own state, otherwise the album is queued (`ds-list-pending-v1`). The queue drains into whichever list is edited next, the moment a builder is editing: a bare `/list` visit starts a **fresh** list from it (the last-session draft stays an archived "Resume" entry, auto-stashed into My lists), returning to your own `?d=` link appends to that list. Storage events cover a builder open in another tab; the drain-on-edit effect covers the same tab (storage events don't fire in the tab that wrote them).
- **My lists**: a small shelf of explicitly saved snapshots (`ds-list-saved-v1`, newest first, deduped by payload, capped at 20) with load/delete in the builder sidebar. The working list is pinned on top ("Current"), so it's clear what loading another list replaces. Browser-local only.
- **Clear all** takes two taps.

## Pages

Items beyond `cols×rows` paginate instead of hiding: a pager under the preview, numbering continuous across pages, and the PNG route takes `?page=` (1-based, clamped) so each page exports as its own image (`-pN` filename suffix). **Fixed shapes** lay out at full `cols×rows` capacity, the chosen dimensions ARE the chart (a 5×5 with 3 covers is a sparse 5×5); unfilled slots render as faint outlines in the preview (not exported), and tiles stay the same size on every page. The **auto** shape instead hugs the covers each page actually has. Adding an album jumps the preview to the page where it lands, so an add is never invisible. The page is view state, not part of `?d=`.

## Action bar

All chart actions (Edit in view mode, Share, Copy link, Download, Copy image) are one row of compact pills directly under the chart, sized to and aligned with the chart box whatever its shape. The settings column keeps only search, My lists (resume + saved, above the settings card), the option groups, and Clear all.

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
| `lib/listDraft.ts` | localStorage draft + saved lists, `addToList` (album modal → builder/draft handoff) |
| `app/api/list/image/route.tsx` | PNG export via `next/og` |
| `app/api/albums/by-ids/route.ts` | Batch album fetch |

## Not done (deferred)

- CSV import; per-item ratings/notes; touch drag-and-drop (the always-visible ← → buttons cover touch); short links (would need server-side persistence, conflicts with the state-lives-in-the-URL design).
