# DESIGN.md — Dungeon Synth Releases

> Plain-text design system. Source of truth for visual direction. Every token here mirrors `app/globals.css` — when CSS changes, update this file in the same commit.

---

## 1. Visual Theme & Atmosphere

A dungeon-synth zine. The site reads like a hand-set chronicle of releases, not a dashboard. Density is editorial, not data-rich. Whitespace is deliberate but never airy — type ladders sit close to give the page weight.

Five mood pillars carry the aesthetic everywhere:

- **Paper grain.** A monochrome SVG-noise overlay sits above the page (`body::before`, `--texture-opacity` default `0.075`, user-adjustable). It softens flat fills and reads as printed stock. Every theme keeps the same noise; only the underlying color shifts.
- **Vignette.** A subtle radial darken at the edges (`body::after`) anchors the content to the center — even on light themes where the gradient is barely visible. Never disable.
- **Candlelight glow.** Hover on focal cards (cover tiles, modal accents) lights an accent-tinted soft shadow + 1.02× scale (`.hover-candlelight`). Reserved for primary affordances; not a default for every interactive element.
- **Scroll descent.** As the user scrolls deeper into the date range, a fixed-black overlay (`bg-black`) fades up to `0.18` opacity (handled by `ScrollDescent`, driven by `visible-date-change` events). Reads as descending into a chamber. Theme-neutral by design — black darkens both light and dark surfaces.
- **Sigil iconography.** Glyph icons are drawn from a fixed Unicode sigil set (see Iconography below). Heroicons / Lucide / Tabler / Phosphor are explicitly out — they break the register.

---

## 2. Color Palette & Roles

Every color is referenced as a Tailwind utility (`bg-bg`, `text-text-dim`, `border-border`, `text-accent`, …) backed by a CSS custom property. **Never hard-code a hex value in a component.** The palette is theme-aware — tokens remap when `data-theme` switches on `<html>`.

### Semantic tokens

| Token | Tailwind utility | Role |
|-------|-----------------|------|
| `--color-bg` | `bg-bg` | Page background. The deepest layer. |
| `--color-bg-card` | `bg-bg-card` | Cards, popovers, dropdowns, modal bodies. One step lighter than `bg`. |
| `--color-bg-hover` | `bg-bg-hover` | Hovered list rows, hovered nav items. |
| `--color-border` | `border-border` | Hairline rules, card outlines, separators, ornamental gradient endpoints. |
| `--color-text` | `text-text` | Default body copy. |
| `--color-text-dim` | `text-text-dim` | Secondary copy, captions, disabled affordances, separator dots. |
| `--color-text-bright` | `text-text-bright` | Headings, hovered states, key emphasis. |
| `--color-accent` | `text-accent` / `bg-accent` / `border-accent` | Brand voice. Used sparingly: masthead title, primary CTA hover ink, focus rings, active tab. |
| `--color-accent-hover` | `text-accent-hover` | Accent-on-accent hover (e.g. external "Bandcamp →" link). |
| `--color-tag-include` | `text-tag-include` | Three-state filter — include chip ground. |
| `--color-tag-exclude` | `text-tag-exclude` | Three-state filter — exclude chip ground. |
| `--color-tag-neutral` | `text-tag-neutral` | Tag without a state set. |

### Derived tokens (stats plots)

| Token | Resolves to |
|-------|-------------|
| `--color-plot-bar-min` | `color-mix(in srgb, var(--color-accent) 35%, var(--color-bg))` |
| `--color-plot-bar-max` | `var(--color-accent)` |
| `--color-plot-bar-hover` | `var(--color-accent-hover)` |

### Backdrop / overlay

| Token | Value | Role |
|-------|-------|------|
| `--color-backdrop` | `rgba(0, 0, 0, 0.55)` | Modal backdrop. Intentionally theme-neutral — dialogs need a dark scrim on light themes too. Used by `ModalShell`, `AlbumDetail`, `SearchPalette`. |

### Documented exceptions to "no hex in components"

Two places hold hex literals on purpose. Don't add a third without a comment explaining why.

- `components/ThemePicker.tsx` — mirrors each theme's bg + accent so the swatch buttons paint correctly *before* the theme is applied. Update both files together.
- `components/CalendarHeatmap.tsx` — `inferno` and `viridis` are static scientific palettes the user can cycle to. The default `theme` palette uses `color-mix` against tokens correctly.

### Themes (10)

Each theme replaces every `--color-*` token under a `[data-theme="<name>"]` selector. The default (no `data-theme` attr) matches `catacombs`. The active theme is persisted to `localStorage` and read by an inline `<script>` in `<head>` *before* hydration, so a returning visitor on a non-default theme never sees the Catacombs default flash. A few representative palettes:

| Theme | bg | text | accent | Mood |
|-------|----|------|--------|------|
| catacombs | `#1a1410` | `#d4c8b8` | `#a63d2f` | warm dark, default |
| stone | `#12151a` | `#c0c8d8` | `#5b8fb9` | cool dark |
| moonlit | `#141520` | `#d0ccc0` | `#c4993c` | navy + gold |
| abyss | `#0c0a12` | `#c4c0d8` | `#8b5ec4` | deep purple-black |
| ember | `#181210` | `#d4c4a8` | `#cc6a2e` | orange-fire |
| mire | `#101410` | `#b8c8b4` | `#5a9a4a` | swamp green |
| fog | `#e8e6e1` | `#3a3832` | `#4a7a5a` | cool light |
| parchment | `#f0e8d8` | `#3a3020` | `#8b2e20` | warm light |
| overcast | `#2a2a2e` | `#c8c8cc` | `#8a9ab0` | neutral medium |
| bone | `#f5f0e8` | `#44403a` | `#6a5040` | pale warm |

See `app/globals.css` for the full per-theme set.

---

## 3. Typography Rules

Two families, loaded via `next/font/google` in `app/layout.tsx`:

- **`var(--font-display)` → Cinzel** (400, 700). Used for: masthead, tab bar, button labels (small caps style), section headers, captions, all-caps eyebrow text, numeric counts. Always paired with **letter-spacing** (`tracking-[0.1em]` minimum, `tracking-[0.2em]` for tight uppercase eyebrows).
- **`var(--font-sans)` → Crimson Text** (400, 600, 700). Used for: body copy, album titles (italic), modal subtitles, search input, ornamental dividers. Despite the variable name, this is a serif. Italics carry "title" semantics — album titles are italic, dates are not.

### Hierarchy

| Role | Family | Size / weight | Notes |
|------|--------|---------------|-------|
| Masthead title | display | `text-2xl sm:text-4xl` / `font-bold` | `text-accent`, `tracking-[0.1em]`, lowercase preserved |
| Masthead tagline | display | `text-[10px] sm:text-xs` / 400 | `tracking-[0.2em]`, uppercase, `text-text-dim` |
| Page header (`PageHeader`) | display | `text-base sm:text-lg` / 400 | `tracking-[0.15em]`, uppercase, `text-text-bright` |
| Modal title (`<h2>`) | sans | `text-lg`–`text-xl` / `font-bold` | not italic, `text-text-bright`, `leading-tight` |
| Album title in cover grid | sans | `text-[0.8rem]` / `font-medium` | `text-text-bright` (no italic — title sits below the cover, italic would clash with the host caption) |
| Album title in list row / detail modal | sans | `text-sm` (`0.875rem`) | `italic`, `text-text-bright` |
| Body copy | sans | `text-base` / 400 | `text-text` |
| Tab / nav item | display | `text-xs` / 400 (`text-[11px]` in scope nav) | `tracking-[0.15em]`, uppercase |
| Eyebrow / caption | display | `text-[10px]` / 400 | `tracking-[0.15em]`–`tracking-[0.2em]`, uppercase, `text-text-dim` |
| Tag chip / filter pill | display | `text-[10px]` / 400 | `tracking-wide`, lowercase preserved |
| Numeric counts | display | `text-xs` / 400 | `tabular-nums`, `text-text-bright` |
| Footnote / micro | display | `text-[9px]`–`text-[10px]` | `tracking-[0.1em]`, uppercase or `tabular-nums` |

### Rules

- Never set `font-family` inline; use `font-display`, `font-sans`, or omit (sans is the default body).
- All caps appears in display contexts only. Body text is sentence case.
- Italic is reserved for album titles in list rows / modal headers + ornamental-divider date strings. Cover-grid titles stay upright so they don't clash with the host caption underneath.
- `font-sans` is mapped to **Crimson Text** (a serif). Tailwind's default `font-sans` utility therefore renders serif everywhere on the site. Be aware when bundling third-party UI that expects a true sans default.
- Use `tabular-nums` for any count, year, duration. Never let proportional digits jiggle.
- Decorative tracking is intentional. Don't strip `tracking-*` to "clean up" headers.

---

## 4. Component Stylings

Components live flat under `components/`. No subdirectory grouping. Conventions below describe the *visual contract*; behaviour lives in the file.

### Buttons

Three flavours:

- **Ghost** (default in this site): no background, text-only, hover swaps `text-text-dim` → `text-accent` with `transition-colors`. Includes `cursor-pointer`. Used for nav, filter close (`×`), reset (`↺`), close, back. Almost every button is ghost.
- **Border-pill**: `border border-border/50 hover:border-accent/50 cursor-pointer`, `font-display text-[10px] tracking-[0.2em] uppercase`, `px-4 py-1.5`. Used for "Show more", load-more triggers.
- **Icon ghost**: `w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer`. Used for modal back/close, calendar popover toggle.

Disabled / inactive buttons drop opacity to ~40% and lose `cursor-pointer`.

### Cards (cover grid)

```
aspect-square bg-bg-card border border-border overflow-hidden
flex items-center justify-center hover-candlelight cursor-pointer
```

Empty / no-art fallback: `<span aria-hidden className="text-3xl text-border select-none">♜</span>`. Always centred. Sigil acts as a placeholder, not a logo.

### Tag / filter pills (`FilterPill`)

```
inline-flex items-center gap-1 text-[10px] tracking-wide px-1.5 py-0.5
include: bg-tag-include/15 text-tag-include border-b border-tag-include/70
exclude: bg-tag-exclude/15 text-tag-exclude border-b border-tag-exclude/70
```

Leading sigil (`✦` include, `⊘` exclude), label (line-through when exclude), trailing `×` to clear. One `FilterPill` component used everywhere — never reproduce inline.

### Modals (`ModalShell`)

Backdrop: `fixed inset-0` + `backdrop-blur-xs` + `rgba(0,0,0,0.55)`. Dialog: `bg-bg`, `border border-border` on desktop only, `animate-modal-in`. Sized via `size="sm" | "md" | "lg"` (24rem / 36rem / 56rem). Mobile collapses to full-screen (`w-full h-dvh`). Box shadow combines a generic dark falloff with a faint accent glow:

```
0 0 80px -10px rgba(0,0,0,0.8),
0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)
```

Modal headers carry: cover/avatar tile (10×10) · title block (`<h2>` + dim subtitle) · filter pills cluster · ViewToggle · back arrow (`←`) · close (`×`). Close is always top-right. Back is always immediately left of the view toggle.

`AlbumDetail` is the documented exception — it rolls its own portal because its layout is a side-by-side cover + metadata pane (`max-w-2xl`, `sm:flex-row`) that the size-bucketed `ModalShell` can't host without contortion. Backdrop, animations, and z-index match `ModalShell`; only the dialog frame differs. `DeepAlbumSkeleton` mirrors the same frame and renders while a deep-linked album fetches.

### Skeletons

While data loads, modals render skeletons rather than blank frames or spinners.

- `GridSkeleton` / `ListSkeleton` (`components/ModalSkeletons.tsx`) — for `ScopeModal`, `DayModal`, `UpcomingModal` body content. `animate-pulse` on the wrapper, placeholder bars sized to match the loaded card heights one-for-one (zero CLS on swap).
- `DeepAlbumSkeleton` — full modal frame with cover placeholder + text-bar stack. Pulse only on the inner placeholder column so the modal-in entrance animation isn't doubled.
- `CalendarHeatmapSkeleton` (inside `HeatmapPopoverButton`) — 53×7 grid placeholder using the same grid template as the real calendar so popover height stays stable.
- `TagContextBarsSkeleton` — used inside genre `ScopeModal` while the tag-context fetch is in flight.

### Navigation feedback

- `NavigationProgress` — 2px accent-coloured bar fixed at the top, fires on every soft nav (any `pathname` or non-modal `searchParam` change). Modal toggles use `pushState` and intentionally don't trigger it. Decays over 500ms.
- `<a href="#main-content">` skip link — sr-only by default, becomes visible on focus. Lets keyboard users jump past the masthead into the feed.

### Ranked list rows (`HostRow`, `TagRow`, `BarRow` candidate)

```
relative h-7 flex items-center shrink-0 cursor-pointer group
hover:[--bar-bg:var(--color-plot-bar-hover)]
```

Absolute background fill (`absolute inset-y-0 left-0 rounded-sm`), name span on the left (`text-text group-hover:text-text-bright`), count span on the right (`text-text-bright tabular-nums`). The bar fill width comes from the data; the row height is fixed.

### Ornamental dividers

- `.masthead-rule` — header separator, accent-fades-into-border-fades-into-accent gradient with a centered `⟡` crest.
- `.modal-rule` — softer version inside modals, centered `·` glyph.
- `.ornamental-divider` — collapsible day section header, italic serif label flanked by gradient lines into `--color-border`.

These three carry the design's "this is a fresh chapter" feel. Don't replace with plain `<hr>`.

### Iconography (sigils)

Approved Unicode glyphs only. No SVG icon sets.

| Glyph | Role |
|-------|------|
| `♜` | Host / no-art placeholder |
| `❖` | Genre |
| `♞` | Artist |
| `⌕` | Search |
| `⌘` | Mac chord hint (in `<kbd>`; the words `Esc` and `/` go alongside it as plain text in `<kbd>`s) |
| `✦` | Include filter |
| `⊘` | Exclude filter |
| `⟡` | Masthead crest |
| `·` | Inline separator |
| `▦` | Calendar / grid view |
| `☰` | List view |
| `▾` `▸` | Expand / collapse caret |
| `↺` | Reset (per-control or global) |
| `↻` | Recompute layout |
| `←` | Back |
| `×` | Close |
| `→` | "Bandcamp →" external link tag |
| `❧` | TagGraph empty-state ornament |

When adding a glyph that isn't on this list, justify it in the PR or use one of the above.

### Forms / inputs

Search input: `bg-transparent`, no border, `font-sans`, `placeholder:text-text-dim`, `focus:outline-none`. Sliders use native `accent-accent`.

---

## 5. Layout Principles

### Spacing scale

Adopt Tailwind's default rem ladder, but lean on a small subset:

- `gap-1`, `gap-1.5`, `gap-2`, `gap-3`, `gap-4` — almost every gap. `gap-1.5` is preferred for tag/pill clusters; `gap-3` for inline avatar+title; `gap-4` for major content gaps.
- `px-4 sm:px-6` — every page outer container.
- `pt-6 sm:pt-8` — header top.
- `py-1.5`, `py-2`, `py-2.5` — list-row padding.
- `mt-1`, `mt-4`, `mt-6 sm:mt-6` — vertical rhythm. Avoid odd custom values like `mt-3.5`.

### Grids

- Cover grid: `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4`.
- Day-section list: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4`.
- Page wrapper: `max-w-6xl mx-auto px-4 sm:px-6 h-full`.

### Whitespace philosophy

The page must read as a chronicle, not a feed. Days separated by ornamental rules; sections breathing room comes from those rules + the `pt-4 sm:pt-6` between them, not from large blank areas. Modals are dense — title block top, content fills; never "centre an empty header on a half-filled card".

### Header anatomy

```
<header>
  [Masthead title + tagline]                [Search] [Theme] [About]
  [masthead-rule]
  [TabBar: Releases / Statistics / Tag Graphs]   #tag-filter-slot ← [▸ Tag Filter (n)] [?]
</header>
[TagFilter expanded panel — absolute overlay, z-40, max-h-[70vh], renders below <header>]
[Per-page sub-nav row]
  /              → Recent · Past Years ▾ · Upcoming + count + heatmap          [FilterChips]
  /releases/[y]  → same                                                         [FilterChips]
  /statistics    → Overall · By Year                                            [FilterChips]
  /graphs/*      → Genres · Themes                                              (no chips)
[gradient divider]
```

`TagFilter` mounts its trigger button + `?` info icon into `#tag-filter-slot` via portal so the expanded panel can render outside the `<header>` element without pushing other affordances around. Inside the panel: category tabs (genres / themes / aesthetics / artists / locations / instruments / formats) right-aligned at the top, then the tag chip grid with `border-b-2` on every chip so toggling include/exclude doesn't reflow. Hidden entirely on `/graphs/*`.

`FilterChipsSlot` renders absolute on the right of each sub-nav row (`absolute top-1 right-4 sm:right-6 max-w-[60%] overflow-x-auto`) so adding chips never resizes the row.

---

## 6. Depth & Elevation

The site is mostly flat. Three depth layers exist:

1. **Page** — `bg-bg`. Vignette + paper-noise overlay live above this layer (z-index `--z-vignette`, `--z-texture`).
2. **Surface** — `bg-bg-card` for cards, popovers, modals. Always paired with `border-border` (1px). No drop shadow at rest.
3. **Floating** — modal dialog and theme-picker / heatmap popovers. Elevated with `box-shadow` (modals carry an accent-tinted glow; popovers use plain `shadow-lg`).

Z-index ladder (low → high):

| Z | Layer |
|---|-------|
| `50` | Heatmap popover (intentionally low — never overlaps with a modal because the user can't trigger both at once) |
| `9000` | TagGraphCanvas fullscreen mode (sits below vignette + texture so the page chrome still reads) |
| `9997` | Scroll-descent overlay |
| `9998` | Vignette |
| `9999` | Paper-noise texture |
| `10000` | Modal dialog (`ModalShell`, `AlbumDetail`, `DeepAlbumSkeleton`) and theme-picker popover (intentionally coplanar — they never coexist) |
| `10050` | Search palette (always on top so ⌘K works mid-modal) |
| `10100` | Skip-to-content link (focus state) and `NavigationProgress` bar — must clear every other surface |

Hover elevation:

- **List row** — colour shift only. No translation.
- **Card / cover tile** — `hover-candlelight` adds a 30%-accent shadow + 1.02× scale + `border-accent`. Reserve for primary affordances.
- **Theme swatch** — `transition-transform hover:scale-125`. Doesn't apply to anything else.

Border opacity mod (`/50`, `/60`) is normal: `border-border/50` softens an outline without changing its colour ramp.

---

## 7. Do's and Don'ts

### Do

- Read tokens from CSS variables. Use Tailwind's `bg-bg` / `text-text` / `border-border` / `text-accent` etc.
- Reach for `font-display` for any uppercase / tracked / numeric label; `font-sans` (serif) for anything narrative.
- Use the sigil set for icons. Pair an `aria-hidden="true"` sigil with a screen-reader text label when used as the only content of a button.
- Treat `cursor-pointer` as mandatory on every interactive element. The site uses no native `<a>` cursors as a fallback.
- Add focus rings on interactive elements (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` or analogous).
- Wrap any modal content with `Suspense` and the `ModalShell` component; never roll a portal by hand.
- Page lists: ship minimal fields up front (id, artist, title, date, primary tag); enrich via modal fetch.

### Don't

- Don't introduce `next/image`. Cover art and host avatars are hotlinked direct from Bandcamp via plain `<img>` to keep Vercel egress at zero. Set `decoding="async"` and `alt`/`alt=""` correctly.
- Don't write hex / rgb / oklch colours in components. If you need a transparent overlay, use `color-mix(in srgb, var(--color-…) 30%, transparent)`.
- Don't introduce a third font family. Two is the budget.
- Don't import an SVG icon library. Sigils only.
- Animations live in the `0.25s`–`0.4s` range. Backdrops fade at `0.25s`, modal-in at `0.35s`, fade-slide-in at `0.4s`. Snap-scale hover (`hover-candlelight`) at `0.3s`. Anything longer reads as sluggish.
- Don't centre empty space inside modals. If content is loading, render a skeleton (`GridSkeleton`, `ListSkeleton`).
- Don't put filter logic on the client. Every filter is URL-driven (`?tag=` / `?xtag=` / modal `?genre=`); the server does the intersection.
- Don't add per-theme conditional rendering. If something looks wrong on a light theme, fix the token, don't branch.

---

## 8. Responsive Behavior

Two breakpoints carry the lift:

- **Mobile** (default, < 640px): single column, full-screen modals (no border, `h-dvh`), horizontal date slider above the list, tighter gaps (`gap-3`), smaller masthead (`text-2xl`).
- **Desktop** (≥ 640px / `sm:`): cover grid expands to 3-5 columns, modals dock as centred cards (`sm:max-h-[85vh]`, `sm:border`), vertical date slider docked right (`70px` wide), masthead grows to `text-4xl`.

Tablet sizes (`md`, `lg`) only adjust grid column counts. No third layout tier.

### Touch targets

- Minimum tap area: 44×44px effective. Buttons declared with `w-7 h-7` / `w-8 h-8` rely on padded parent rows to meet this; verify when adding a new isolated icon button.
- Hover states are not the primary affordance signal on touch — every hoverable element has a tap-state equivalent (active state, navigation push).

### Collapsing strategy

- Filter cluster: chip set wraps to a second row. Never truncated.
- Tab bar: scrollable horizontally on overflow, with nav glyph fallback if more tabs ever land.
- Header avatar / icon row: shrinks first; title text truncates last (`truncate min-w-0`).
- TagGraph canvas: full-width on mobile, fixed control panel slides in from the right on desktop.

### Typography

Headings use `text-[base] sm:text-[step-up]` to avoid mobile clipping. Body copy stays at one size — readability beats responsiveness here.

---

## 9. Agent Prompt Guide

When asking an AI to build / modify a UI surface in this project, use this skeleton:

> Build [page / component] for the dungeon-synth-releases site. Match the existing visual system in `DESIGN.md` and `app/globals.css`. Use Tailwind classes only. All colours come from CSS variables (`bg-bg`, `text-text-dim`, `text-accent`, etc.) — no hex literals. Use `font-display` (Cinzel) for tracked / uppercase / numeric labels and `font-sans` (Crimson Text serif) for narrative copy. Icons are Unicode sigils — see the iconography table. Modals go through `<ModalShell>`. Cover art renders as plain `<img>` (no `next/image`). Verify in the default Catacombs theme and at least one light theme (Parchment).

### Quick token cheatsheet

```
Backgrounds:   bg-bg                 page
               bg-bg-card            surface (card, popover, modal body)
               bg-bg-hover           hovered row

Text:          text-text             body
               text-text-dim         secondary / caption
               text-text-bright      heading / hovered

Border:        border-border         hairline
               border-border/50      softened outline
               border-accent         active / hovered card

Accent:        text-accent           brand voice
               text-accent-hover     accent-on-accent hover

Filter:        text-tag-include      ✦ ground
               text-tag-exclude      ⊘ ground
               text-tag-neutral      no state

Plot bars:     var(--color-plot-bar-min)   bar floor
               var(--color-plot-bar-max)   bar ceiling (accent)
               var(--color-plot-bar-hover) hovered bar

Fonts:         font-display          Cinzel — uppercase, tracked
               font-sans             Crimson Text serif — body / italic titles
```

### Sample component prompt

> New modal showing a ranked list. Wrap content in `<ModalShell titleId="…" size="md" onClose={…}>`. Header: `pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-4`, title block left, ViewToggle + back (`←`) + close (`×`) right. Body: `flex-1 overflow-y-auto px-6 py-4`. Each row matches `HostRow` / `TagRow` (`relative h-7 flex items-center cursor-pointer group hover:[--bar-bg:var(--color-plot-bar-hover)]`, absolute fill bar, `tabular-nums` count). Use `GridSkeleton` / `ListSkeleton` while loading and `FetchError` on failure. Open downstream scopes via `useOpenModal`.

For new charts: use the `--color-plot-bar-min` / `-max` / `-hover` tokens, `tabular-nums` for counts, `font-display tracking-[0.15em] uppercase` for axis labels. No grid lines.

---

*See `app/globals.css` for the full theme registry, `app/layout.tsx` for the masthead layout, and `components/FilterPill.tsx`, `components/ModalShell.tsx`, `components/HostRow.tsx`, `components/TagRow.tsx`, `components/PageHeader.tsx` for canonical implementations.*
