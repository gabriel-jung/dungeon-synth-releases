# /list, the shareable list builder

A Topsters-style builder: search dungeon synth releases, arrange them in a grid (or ranked list), and download the result as a PNG or share it by link. One tool page (like `/about`), **not** an entity page.

## What it is

- Search → add releases → arrange → **Share link** / **Download PNG**.
- The whole chart (items + every layout option) is encoded in the URL, so a link reproduces the exact list. No server-side persistence.
- A 1-item story-shaped chart doubles as a single-album share card (the **Card** quick layout).

## View mode vs edit mode

A `/list?d=` link opens as a **read-only shared view**: the chart fitted to the viewport (both dimensions, any screen), plus [Edit this list] [Share link] [Download image] and a "make your own" link. No settings column, no drag handles, no per-tile buttons; captions still open the album modal. [Edit] swaps the builder in without navigation.

Author detection: if the URL `d` equals the localStorage draft's `d`, the visitor is the author reloading their own link and goes straight to the builder. While in view mode the draft is **never** overwritten (viewing someone's list must not clobber your own work in progress).

A `?d=` that fails to decode (corrupt, truncated, or from a future codec version) shows a "this share link is damaged" notice instead of silently opening an empty builder.

## Quick layouts + mobile defaults

Three preset buttons at the top of the settings (each a one-tap `patch`, everything stays adjustable after):

- **Grid**: 5×5, captions under covers, square. The desktop default.
- **List**: 1 column, captions beside covers (side text), 9:16. Rows grow to the item count (capped at `MAX_ROWS`).
- **Card**: 1×1, caption below, 9:16, artwork backdrop, wrapped captions (a share card never truncates the album name). Player-style single-album share card.

First visit on a touch device (`pointer: coarse`, no draft, no `?d=`) defaults to the List shape instead of the grid.

## State lives in the URL (`?d=`)

`lib/listCodec.ts` packs the full `ChartState` into one compressed param:

```
/list?d=<base64url( gzip( JSON(ChartState) ) )>
```

`encodeState` / `decodeState` use the native `CompressionStream` (browser + Node, no dep). `decodeState` returns `emptyState()` on any malformation, caps the decompressed size (`MAX_DECODED_BYTES`, a `?d=` blob is attacker-controllable and gzip bombs are cheap), and rejects blobs stamped with a future `STATE_VERSION`; `sanitizeState` then clamps every field. `ChartState`:

| Field | Meaning |
|-------|---------|
| `items` | ordered album ids (decimal strings; int8 can exceed `MAX_SAFE_INTEGER`) |
| `texts` | per-item caption overrides aligned to `items` (`{t?, a?}` custom title/artist, `null` = none, trailing nulls trimmed). Edited via the ✎ tile button; empty field falls back to the album's own data. Each field capped at `MAX_TITLE_LEN`. Travels with its item through reorder/move/remove |
| `cols`, `rows` | grid dimensions; `cols×rows` = visible slot count (`chartCapacity`) |
| `gap` | 0–24; drives both the inter-cover gap **and** the outer margin |
| `frameWidth` | cover frame weight, 0 = off (default), 1–6. `frameBorder(tile, level)` scales it to the tile (border color `ink.dim`, drawn inside the tile so layout math is untouched) so the weight matches across cover sizes and between preview + export |
| `bg` | backdrop preset (`theme`/`art`/`black`/`slate`/`oxblood`/`parchment`/`bone`) or `#rrggbb`. `art` layers the page's first cover full-bleed (dimmed, dark gradient overlay, covers get a lift shadow) on a near-black base, streaming-share-card style; default for the Card preset. `slate`/`oxblood` are dark colored tones, `parchment`/`bone` light; each carries tuned ink via `chartInk` |
| `aspect` | output shape, see `ASPECTS`. Default `auto` hugs the content (canvas = covers, no dead space, `autoCanvas`); the fixed frames (`square`, `portrait45`, `portrait916`, `landscape43`, `landscape169`) fit the content into a predictable social-media size |
| `coverSize` | 1–5, 5 = autofit covers to fill the frame; lower shrinks them (`COVER_FRACS`) |
| `anchor` | `center` (default, centred in the frame) or `topleft` (margin = gap) |
| `numbered` / `numberText` | rank number on the cover badge / prefixed in the caption text |
| `textPos` | `top`/`bottom` (caption under/over cover) or `left`/`right` (side text list) |
| `textSize`, `textAlign`, `wrap` | caption font scale (1–5, `textScale`), alignment, wrap vs clip |
| `footer` | show the "Dungeon Synth Releases" wordmark (off by default) |
| `showTitle/showArtist/showLabel/showDate` | caption fields |
| `title` | chart title |

The builder syncs state → `?d=` via `replaceState` (debounced via `useDebounced`, no history spam) **merging** other params so an open modal (`?album=`) survives. A localStorage draft (`ds-list-draft-v1`) is offered as an explicit "Resume last list" entry on a bare `/list` (no auto-load); an empty session never overwrites it, so it stays resumable. Past ~7.5KB of encoded state the builder warns that the link is too large to travel reliably (proxies commonly cap request lines around 8KB).

## Shared layout math + caption rule (preview == export)

`measureChart(state, count, tile, availW?)` is the single source of layout truth, consumed by **both** the in-app preview (DOM) and the PNG route (Satori), so they can never drift. It returns cell/grid/content dimensions and caption font sizes for a given tile.

- `chartTile(state, count, W, H)`: largest tile whose content fits the fixed canvas (content scales ~linearly in tile, so it probes once at tile=1000 and divides), reserving a **gap-sized edge** so the outer margin equals the inter-cover gap. `coverSize` then shrinks it.
- `chartEdge(state, tile)`: the outer margin (= the gap) for a tile.
- `aspectCanvas(aspect)`: fixed PNG dimensions per shape (square 1080², portrait 1080×1350 / 1080×1920, landscape 1440×1080 / 1920×1080).
- `resolveBg` / `chartInk`: backdrop colour + legible title/caption ink for that backdrop (a light parchment backdrop needs dark ink even on a dark site theme).
- `fitBox(aspect, w, h)`: story safe zones: on `portrait916` the content is fitted into the canvas minus `STORY_SAFE_Y` (250px) top and bottom, so a centred chart never hides under Instagram's username/reply overlays. The canvas stays full 1080×1920.
- `captionFields(state, album, override, rank)`: which caption lines exist (title/artist/label/date, label only for hosted releases, date only when the album has one) and which line the rank number prefixes (title, or artist when the title is hidden, never label/date). Both renderers consume it, so the caption content rule cannot fork.
- `NUMBER_BADGE` / `ART_BACKDROP`: the badge band and art-backdrop styling numbers (gradients, fractions, shadow) shared as constants by both renderers.

Single-cover charts (`cols×rows = 1`) render the artist line at full ink instead of dim, player-style. Wrapped/clipped caption lines carry an explicit `textAlign` (the flex wrapper only places the block, not the text inside it).

### Two layout families

- **Caption under/over cover** (`textPos` top/bottom): each grid cell = cover + caption, aligned by `textAlign`.
- **Side text list** (`textPos` left/right): a covers-only grid + a **single numbered text-list column** beside it. List rows align to grid rows (block of `cols` captions per row). A row grows to `max(cover, text-block height)` so dense columns get space between rows instead of overlapping.

## Preview is true WYSIWYG

`components/ListBuilder.tsx` renders the **exact** export layout at the export tile, then `transform: scale()`s it to fit. Until the first measure, a correctly-shaped placeholder box (CSS `aspect-ratio`) reserves the space so the chart doesn't pop in from nothing.

- **Desktop builder**: the whole canvas fits the column (width AND height, capped to the settings panel / viewport) so the chosen shape always reads true. The caption anchor (100% caption = release-feed 0.8rem) is a ceiling so text never renders oversized; tall frames may shrink captions below it.
- **Mobile builder + view mode (any screen)**: the whole canvas is fitted to the viewport in both dimensions. Shape fidelity wins over caption legibility everywhere.

Mobile builder layout: preview first, settings below; the Layout / Text / Footer groups are collapsible (open by default on desktop, collapsed on mobile via CSS until toggled, so hydration agrees on every device; `aria-expanded` is resolved to the real state after mount).

Interactions (preview only, not baked into the PNG):
- **Drag and drop** covers to reorder (desktop; touch uses the ← → buttons, always visible via `pointer-coarse:` and counter-scaled against the canvas `scale()` so they stay tappable), plus per-tile move/edit-caption/remove on hover. Moving an item across a page boundary follows it to the target page.
- **Caption editor** (✎): a panel under the action bar (outside the scaled canvas, so inputs render at natural size) with custom title/artist fields for that item, placeholder = the original data. Keyed by edit target, so switching targets reseeds the inputs naturally.
- **Clickable captions**: while editing they open the caption editor (the caption is the text being designed); in view mode they open the album detail modal (`useOpenModal` → `?album=`), seeded via `cacheAlbumStub`.

## Sharing

- **Per-list social unfurl**: `generateMetadata` on the page reads `?d=` and points `og:image` at the PNG route (with the chart title + release count), so a shared link unfurls as the actual chart. (The `opengraph-image` file convention can't read query params, but `generateMetadata` can.)
- **Share = the link, image = download** (`ShareLinkAction` in ListBuilder, via the shared `useShareLink` hook): the Share pill shares the list URL through the native sheet where it exists, clipboard copy otherwise; the image is shared by downloading it and posting the file from the gallery. The Download pill fetches the PNG with a visible busy state and surfaces failures in-app (the cold render takes seconds and can rate-limit). In-page image shares were tried (Web Share Level 2 files, clipboard `ClipboardItem`, long-press on a blob-URL `<img>`) and dropped: share targets like Instagram latch onto any URL/text in the payload and refuse it ("Impossible d'envoyer le lien"), and the API is dead on http anyway.
- **Share from the album modal**: a two-entry Share menu, **Link** (same sheet-or-clipboard behavior) and **Card ↓**, a direct download of the story-card PNG (`CARD_PRESET` via `encodeCardState`, pre-encoded on mount), no detour through `/list`. The PNG is warmed by a fetch on hover/focus of the Card entry (intent, not menu-open) so the cold Satori render doesn't sit on the tap. Escape closes the menu (not the modal) and restores focus to the trigger.
- **`?album=` unfurls**: the releases page's `generateMetadata` points `og:image` at the **square** card variant (`encodeCardState(id, "square")`); 9:16 crops badly in link previews, and Twitter stays `card: "summary"` because `summary_large_image` centre-crops a square to ~2:1.
- **Title is always one line**: `titleFontSize` shrinks the font to fit the content width (estimated, Satori can't measure text) with ellipsis as backstop, because `measureChart` budgets a single line and a wrapped title overflows the canvas (clipping covers in centered layouts).
- **Theme backdrop fidelity**: the preview resolves the "Theme" backdrop from CSS vars; the client passes the concrete hex to the PNG route as `?bg=` (honoured only when the state says `theme`) so the download matches the preview. The share link carries the same `bg` param and `generateMetadata` passes it through to the og:image, so unfurls keep the author's backdrop too.

## Add to list from anywhere + saved lists

`lib/listDraft.ts` owns localStorage:

- `addToList(album)` backs the **"+ List"** button in the album modal on every page. It dispatches a cancelable `ds-list-add` event; an editing builder claims it (preventDefault) and updates its own state, otherwise the album is queued (`ds-list-pending-v1`). The queue drains into whichever list is edited next, the moment a builder is editing: a bare `/list` visit starts a **fresh** list from it (the last-session draft stays an archived "Resume" entry, auto-stashed into My lists), returning to your own `?d=` link appends to that list. Storage events cover a builder open in another tab; the drain-on-edit effect covers the same tab (storage events don't fire in the tab that wrote them).
- **My lists**: a small shelf of explicitly saved snapshots (`ds-list-saved-v1`, newest first, deduped by payload, capped at 20) with load/delete in the builder sidebar. The working list is pinned on top ("Current"), so it's clear what loading another list replaces. Saving encodes fresh (never the debounced blob), so a snapshot can't miss the last edit. Browser-local only.
- **Clear all** takes two taps.

## Pages

Items beyond `cols×rows` paginate instead of hiding: a pager under the preview, numbering continuous across pages, and the PNG route takes `?page=` (1-based, clamped) so each page exports as its own image (`-pN` filename suffix). Client and route both derive the page count from `state.items`, so they always agree. **Fixed shapes** lay out at full `cols×rows` capacity, the chosen dimensions ARE the chart (a 5×5 with 3 covers is a sparse 5×5); unfilled slots render as faint outlines in the preview (not exported), and tiles stay the same size on every page. The **auto** shape instead hugs the covers each page actually has. Adding an album jumps the preview to the page where it lands, so an add is never invisible. The page is view state, not part of `?d=`.

## Action bar

All chart actions (Edit in view mode, Share, Download) are one row of compact pills directly under the chart, sized to and aligned with the chart box whatever its shape. The settings column keeps only search, My lists (resume + saved, above the settings card), the option groups, and Clear all.

## Export, `app/api/list/image/route.tsx`

`next/og` `ImageResponse`, rate-limited at 60/min per IP (album unfurls point og:image here, so a crawler resolving a burst of fresh links must not starve real downloads; the day-long `Cache-Control` absorbs repeats). Fonts are read once at module scope and mirror the site split: Cinzel (woff, same as `app/opengraph-image.tsx`) for the chart title/wordmark, Crimson Text (ttf, 400/600 + 400 italic) for captions, so exported captions match the preview's body font. Caption content comes from the shared `captionFields`; tiers: title semibold bright, artist dim italic, label/date dim regular.

Only the requested page's ids are fetched (`fetchAlbumsByIds` on the page slice); the page count derives from `state.items`, and an id that no longer resolves keeps its slot as a bare dark tile, exactly like the preview's placeholder, so captions and rank numbers never shift. A DB failure degrades to an all-placeholder chart instead of a 500.

Satori notes: rejects an explicit `boxShadow: undefined`, spread conditional style keys. Fixed canvas per shape; content fitted + anchored top-left (margin = gap) or centred. Covers pulled at 700px (`coverUrl(..,"xl")`). The `art` backdrop draws the first cover full-bleed at low opacity under a dark `linear-gradient` (Satori has no `filter: blur`; the dimmed 700px upscale reads soft enough) with a `boxShadow` lift on the covers; the preview mirrors all three layers exactly (same `ART_BACKDROP` constants). Title crest is a **drawn diamond** (Cinzel has no `⟡` glyph and Satori has no system fallback). Long captions clip (ellipsis) or wrap. `Content-Disposition: attachment`. Satori is a flexbox subset (no CSS grid): the grid is `flexWrap` at a fixed cell width.

## Data

- `lib/supabase.ts → fetchAlbumsByIds`: order-preserving (`in()` doesn't preserve order); used by the page (SSR hydrate) + the image route. Throws on a Supabase error; both callers catch and degrade.

## Files

| Path | Role |
|------|------|
| `app/list/page.tsx` | Server: decode `?d=`, fetch albums, render builder |
| `components/ListBuilder.tsx` | Client island: controls, preview, sync, DnD, modal open, export/share buttons |
| `components/ListSearchAdd.tsx` | Search-to-add box (stays open behind a modal) |
| `lib/listCodec.ts` | `ChartState`, encode/decode, `sanitizeState`, `measureChart`/`chartTile`/`chartEdge`/`fitCanvas`, `aspectCanvas`, `captionFields`, `NUMBER_BADGE`/`ART_BACKDROP`, `resolveBg`/`chartInk`, `textScale` |
| `lib/listDraft.ts` | localStorage draft + saved lists, `addToList` (album modal → builder/draft handoff) |
| `lib/useShareLink.ts`, `lib/useClickOutside.ts` | shared share-or-copy + click-outside hooks (ListBuilder, AlbumDetail) |
| `app/api/list/image/route.tsx` | PNG export via `next/og` |

## Not done (deferred)

- CSV import; per-item ratings/notes; touch drag-and-drop (the always-visible ← → buttons cover touch); short links (would need server-side persistence, conflicts with the state-lives-in-the-URL design).
