// State codec + shared render truth for the /list chart builder. Everything
// that must not drift between the DOM preview and the PNG export (layout math,
// caption rule, styling constants) lives here alongside the codec, because
// both are "the chart, defined once". The chart IS the URL: the full
// builder state (items + grid + text config) is gzipped and
// base64url-packed into a single `?d=` param, so a chart is shareable and
// bookmarkable with no server-side persistence. localStorage mirrors it as the
// working draft. This keeps the site's "state lives in the URL" property while
// scaling to freeform text that readable params can't hold.
//
// Encoding: JSON -> gzip (CompressionStream, native in browser + Node) ->
// base64url. Both ends are async because the compression API is stream-based.

import { formatDateShort, isHostedRelease, type AlbumListItem } from "./types"

export const STATE_VERSION = 1
export const MAX_ITEMS = 100
export const MAX_TITLE_LEN = 80
export const MIN_COLS = 1
export const MAX_COLS = 10
export const DEFAULT_COLS = 5
export const MIN_GAP = 0
export const MAX_GAP = 24
export const DEFAULT_GAP = 8

export const MIN_FRAME = 0
export const MAX_FRAME = 6
export const DEFAULT_FRAME = 0
// Border px for a cover frame level, scaled to the tile so the weight reads the
// same across cover sizes and stays identical between the preview and the PNG
// export. Level 0 = no frame.
export function frameBorder(tile: number, level: number): number {
  if (level <= 0) return 0
  return Math.max(1, Math.round(tile * 0.004 * level))
}

// Background presets reference theme tokens by key; the builder resolves them
// to CSS values. A raw hex (#rrggbb) is also accepted for custom backgrounds.
// "art" layers the first cover full-bleed (dimmed, under a dark gradient) on a
// near-black base, like streaming-service share cards; the chart's first item
// drives it, so it follows reorders.
export const BG_PRESETS = ["theme", "art", "black", "slate", "oxblood", "parchment", "bone"] as const
export type BgPreset = (typeof BG_PRESETS)[number]

export const MIN_ROWS = 1
export const MAX_ROWS = 12
export const DEFAULT_ROWS = 5

// Base export tile (px) for the "auto" shape, which sizes the canvas to the
// content. Fixed-shape exports recompute the tile to fit the chosen frame. Art
// is fetched at 700px (_16) so even a large tile stays crisp.
export const EXPORT_TILE = 320

// Output shapes. "auto" hugs the content (the chart is exactly as big as the
// grid, no dead space); the rest are fixed frames the content is fitted +
// centered into (iOS-Photos style), so the image size stays predictable
// whatever the layout.
export const ASPECTS = ["auto", "square", "portrait45", "portrait916", "landscape43", "landscape169"] as const
export type Aspect = (typeof ASPECTS)[number]
// No "auto" entry: that shape's canvas is computed from the content (autoCanvas).
export const ASPECT_CANVAS: Partial<Record<Aspect, { w: number; h: number }>> = {
  square: { w: 1080, h: 1080 }, // 1:1
  portrait45: { w: 1080, h: 1350 }, // 4:5
  portrait916: { w: 1080, h: 1920 }, // 9:16
  landscape43: { w: 1440, h: 1080 }, // 4:3
  landscape169: { w: 1920, h: 1080 }, // 16:9
}
export function aspectCanvas(aspect: string): { w: number; h: number } {
  return ASPECT_CANVAS[aspect as Aspect] ?? { w: 1080, h: 1080 }
}

// Instagram-style story UI covers ~250px at the top (account name) and bottom
// (reply bar) of a 9:16 canvas. fitBox shrinks the box the content is fitted
// into so a centred chart always lands inside the visible band; the canvas
// itself stays the full story size.
export const STORY_SAFE_Y = 250
export function fitBox(aspect: string, w: number, h: number): { w: number; h: number } {
  return aspect === "portrait916" ? { w, h: h - 2 * STORY_SAFE_Y } : { w, h }
}

// Cover size: 5 = autofit (covers fill the frame), 1..4 shrink them toward the
// centre of the frame. Fraction of the fit-to-frame tile, so it never clips.
export const MIN_COVER = 1
export const MAX_COVER = 5
export const DEFAULT_COVER = 5
export const COVER_FRACS = [0, 0.5, 0.65, 0.8, 0.9, 1.0] as const

export const TEXT_POSITIONS = ["top", "bottom", "left", "right"] as const
export type TextPos = (typeof TEXT_POSITIONS)[number]
export const TEXT_ALIGNS = ["left", "center", "right"] as const
export type TextAlign = (typeof TEXT_ALIGNS)[number]
export const MIN_TEXT_SIZE = 1
export const MAX_TEXT_SIZE = 5
export const DEFAULT_TEXT_SIZE = 3
// 1..5 -> 0.6 .. 1.4 caption scale (3 = 1.0, the default font size).
export function textScale(size: number): number {
  return 0.6 + (Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, size)) - 1) * 0.2
}

// Per-item caption override: custom display title (t) / artist (a). Unset
// fields fall back to the album's own data. Lets users strip catalog-number
// noise ("KTR086 - ...") or relabel a card without touching the source row.
export interface CaptionOverride {
  t?: string
  a?: string
}

export interface ChartState {
  v: number
  items: string[] // ordered decimal album ids (string: int8 > MAX_SAFE_INTEGER)
  texts: Array<CaptionOverride | null> // aligned to items; null = no override
  cols: number
  rows: number // cols×rows = visible slots
  gap: number
  frameWidth: number // 0 = no cover frame; 1..6 = border weight (scaled to tile)
  bg: string // BgPreset key or #rrggbb
  aspect: string // output frame, see ASPECTS
  coverSize: number // 1..5, 5 = autofit covers to the frame
  anchor: string // topleft (uses the gap as margin) | center (centred in frame)
  numbered: boolean // rank number badge on the cover
  numberText: boolean // rank number prefixed in the caption text
  textPos: string // top | bottom | left | right, relative to the cover
  textSize: number // 1..5, caption font scale
  textAlign: string // left | center | right
  wrap: boolean // wrap long captions instead of clipping them
  footer: boolean // show the "Dungeon Synth Releases" wordmark
  showTitle: boolean
  showArtist: boolean
  showLabel: boolean // host / label name
  showDate: boolean
  title: string
}

export function emptyState(): ChartState {
  return {
    v: STATE_VERSION,
    items: [],
    texts: [],
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    gap: DEFAULT_GAP,
    frameWidth: DEFAULT_FRAME,
    bg: "theme",
    aspect: "auto",
    coverSize: DEFAULT_COVER,
    anchor: "center",
    numbered: false,
    numberText: false,
    textPos: "bottom",
    textSize: DEFAULT_TEXT_SIZE,
    textAlign: "left",
    wrap: false,
    footer: false,
    showTitle: true,
    showArtist: true,
    showLabel: false,
    showDate: false,
    title: "",
  }
}

export function isHorizontalText(pos: string): boolean {
  return pos === "left" || pos === "right"
}

export function chartCapacity(s: ChartState): number {
  return s.cols * s.rows
}

// ── Shared layout math (used by the preview DOM + the export PNG so they can't
// drift). Covers are a fixed `tile` px; nothing here rescales them. ──

export interface ChartLayout {
  gap: number
  cols: number
  rows: number
  tile: number
  capH: number
  innerGap: number
  textColW: number
  cellW: number
  cellH: number
  gridW: number
  gridH: number
  titleH: number
  footerH: number
  contentW: number
  contentH: number
  capTitleFs: number
  capSubFs: number
}

// `availW` (content width = canvas minus padding) lets side-text layouts expand
// the text column to fill the frame instead of leaving a fixed gap; omit it for
// the probe in chartTile.
export function measureChart(s: ChartState, count: number, tile: number, availW?: number): ChartLayout {
  const n = Math.max(1, count)
  const gap = Math.round((s.gap / 24) * tile * 0.1)
  const cols = Math.min(s.cols, n)
  const rows = Math.ceil(n / cols)

  const sc = textScale(s.textSize)
  const capTitleFs = Math.round(tile * 0.075 * sc)
  const capSubFs = Math.round(tile * 0.065 * sc)
  const lhTitle = Math.round(capTitleFs * 1.3)
  const lhSub = Math.round(capSubFs * 1.32)
  const capH =
    (s.showTitle ? lhTitle : 0) +
    (s.showArtist ? lhSub : 0) +
    (s.showLabel ? lhSub : 0) +
    (s.showDate ? lhSub : 0)

  const innerGap = gap > 0 ? gap : Math.round(tile * 0.05)
  const sideHasText = isHorizontalText(s.textPos) && capH > 0
  let textColW = Math.round(tile * 1.05)

  // Side text = covers-only grid + a single text-list column beside it (rows of
  // the list align to grid rows). Vertical text = caption under/over each cover.
  // A side row grows to fit its text block (cols captions) so dense columns get
  // space between rows instead of overlapping.
  const itemGap = Math.round(tile * 0.04)
  const sideRowH = capH > 0 ? Math.max(tile, cols * capH + (cols - 1) * itemGap) : tile
  const cellW = tile
  const cellH = isHorizontalText(s.textPos)
    ? sideRowH
    : tile + (capH > 0 ? Math.round(tile * 0.05) + capH : 0)
  const gridW = cols * cellW + (cols - 1) * gap
  const gridH = rows * cellH + (rows - 1) * gap
  if (sideHasText && availW) {
    textColW = Math.max(Math.round(tile * 0.8), availW - gridW - gap)
  }

  const titleH = s.title.trim() ? Math.round(tile * 0.46) : 0
  const footerH = s.footer ? Math.round(tile * 0.205) : 0
  const contentW = sideHasText ? gridW + gap + textColW : gridW

  return {
    gap, cols, rows, tile, capH, innerGap, textColW, cellW, cellH, gridW, gridH,
    titleH, footerH, contentW, contentH: titleH + gridH + footerH, capTitleFs, capSubFs,
  }
}

// Frame the content: "auto" hugs it; a fixed aspect pads it (centered) to the
// chosen ratio. Never smaller than the content, so nothing clips.
export function fitCanvas(contentW: number, contentH: number, aspect: string, pad: number): { W: number; H: number } {
  const cw = contentW + 2 * pad
  const ch = contentH + 2 * pad
  const frame = ASPECT_CANVAS[aspect as Aspect]
  if (!frame) return { W: cw, H: ch }
  const r = frame.w / frame.h
  return cw / ch >= r ? { W: cw, H: Math.round(cw / r) } : { W: Math.round(ch * r), H: ch }
}

// Largest tile whose content fits inside (canvas - 2*pad). Content scales ~
// linearly in tile (gaps + fonts are tile fractions), so probe once at a large
// tile and divide. Then `coverSize` shrinks it toward the frame centre.
export function chartTile(s: ChartState, count: number, canvasW: number, canvasH: number): number {
  const probe = measureChart(s, count, 1000)
  // Reserve a gap-sized edge on every side so the outer margin equals the
  // inter-cover gap exactly (both scale with the tile).
  const edge = Math.round((s.gap / 24) * 1000 * 0.1)
  const kw = (probe.contentW + 2 * edge) / 1000
  const kh = (probe.contentH + 2 * edge) / 1000
  const fit = Math.min(canvasW / kw, canvasH / kh)
  const frac = COVER_FRACS[Math.min(MAX_COVER, Math.max(MIN_COVER, s.coverSize))] ?? 1
  return Math.max(24, Math.floor(fit * frac))
}

// The outer margin (= the inter-cover gap) for a given tile.
export function chartEdge(s: ChartState, tile: number): number {
  return Math.round((s.gap / 24) * tile * 0.1)
}

// Canvas for the "auto" shape: hugs the content plus a gap-sized edge, with
// the longest side capped so exports stay a sane size. Returns the tile too
// (coverSize doesn't apply: there is no frame to shrink away from).
export const AUTO_MAX_SIDE = 2000
export function autoCanvas(s: ChartState, count: number): { tile: number; w: number; h: number } {
  const probe = measureChart(s, count, 1000)
  const edge = Math.round((s.gap / 24) * 1000 * 0.1)
  const kw = (probe.contentW + 2 * edge) / 1000
  const kh = (probe.contentH + 2 * edge) / 1000
  const tile = Math.max(24, Math.floor(Math.min(EXPORT_TILE, AUTO_MAX_SIDE / Math.max(kw, kh))))
  const pad = chartEdge(s, tile)
  const m = measureChart(s, count, tile)
  return { tile, w: m.contentW + 2 * pad, h: m.contentH + 2 * pad }
}

// One-line title font size. measureChart's titleH budgets a single line, so a
// wrapping title overflows the canvas (and a centered layout then clips the
// covers). Satori can't measure text, so estimate ~0.9·fs per uppercase
// Cinzel character (incl. letter-spacing) and shrink to fit the content width.
export function titleFontSize(tile: number, contentW: number, title: string): number {
  const base = Math.round(tile * 0.13)
  const fit = Math.floor(contentW / Math.max(1, title.trim().length) / 0.9)
  return Math.max(12, Math.min(base, fit))
}

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" ? Math.round(n) : NaN
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, v))
}

function clampStr(s: unknown, max: number): string {
  return typeof s === "string" ? s.slice(0, max) : ""
}

// The one definition of an accepted custom color; every bg validation site
// (codec, builder, page metadata, image route) shares it.
export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}

function validBg(s: unknown): string {
  if (typeof s !== "string") return "theme"
  if ((BG_PRESETS as readonly string[]).includes(s)) return s
  if (isHexColor(s)) return s
  return "theme"
}

// Clamp every field defensively: a `?d=` blob is attacker-controllable, so the
// decoded object is treated as untrusted input.
export function sanitizeState(raw: unknown): ChartState {
  const o = (raw ?? {}) as Partial<ChartState>
  const seen = new Set<string>()
  const items: string[] = []
  // Source index of each accepted item, so texts stay aligned even when a
  // crafted blob carries invalid or duplicate ids that get dropped.
  const srcIdx: number[] = []
  const rawItems = Array.isArray(o.items) ? o.items : []
  for (let i = 0; i < rawItems.length; i++) {
    const id = rawItems[i]
    if (typeof id !== "string" || !/^\d+$/.test(id) || seen.has(id)) continue
    seen.add(id)
    items.push(id)
    srcIdx.push(i)
    if (items.length >= MAX_ITEMS) break
  }
  const rawTexts = Array.isArray(o.texts) ? o.texts : []
  const ovField = (v: unknown): string | undefined => {
    const s = typeof v === "string" ? v.slice(0, MAX_TITLE_LEN).trim() : ""
    return s ? s : undefined
  }
  const texts: Array<CaptionOverride | null> = srcIdx.map((i) => {
    const e = rawTexts[i] as Partial<CaptionOverride> | null | undefined
    if (e == null || typeof e !== "object") return null
    const t = ovField(e.t)
    const a = ovField(e.a)
    return t || a ? { ...(t ? { t } : {}), ...(a ? { a } : {}) } : null
  })
  // Trailing nulls carry no information; trimming keeps the encoded URL small.
  while (texts.length > 0 && texts[texts.length - 1] === null) texts.pop()
  return {
    v: STATE_VERSION,
    items,
    texts,
    cols: clampInt(o.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS),
    rows: clampInt(o.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS),
    gap: clampInt(o.gap, MIN_GAP, MAX_GAP, DEFAULT_GAP),
    frameWidth: clampInt(o.frameWidth, MIN_FRAME, MAX_FRAME, DEFAULT_FRAME),
    bg: validBg(o.bg),
    aspect: (ASPECTS as readonly string[]).includes(o.aspect as string) ? (o.aspect as string) : "auto",
    coverSize: clampInt(o.coverSize, MIN_COVER, MAX_COVER, DEFAULT_COVER),
    anchor: o.anchor === "topleft" ? "topleft" : "center",
    numbered: !!o.numbered,
    numberText: !!o.numberText,
    textPos: (TEXT_POSITIONS as readonly string[]).includes(o.textPos as string) ? (o.textPos as string) : "bottom",
    textSize: clampInt(o.textSize, MIN_TEXT_SIZE, MAX_TEXT_SIZE, DEFAULT_TEXT_SIZE),
    textAlign: (TEXT_ALIGNS as readonly string[]).includes(o.textAlign as string) ? (o.textAlign as string) : "left",
    wrap: !!o.wrap,
    footer: o.footer === true,
    showTitle: o.showTitle !== false,
    showArtist: o.showArtist !== false,
    showLabel: !!o.showLabel,
    showDate: !!o.showDate,
    title: clampStr(o.title, MAX_TITLE_LEN),
  }
}

// --- gzip + base64url plumbing (Web-standard, works server + client) ---

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// A maxed-out real state (100 ids + 100 two-field overrides at MAX_TITLE_LEN)
// stays well under this; anything bigger is a decompression bomb, not a list.
const MAX_DECODED_BYTES = 128 * 1024

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_DECODED_BYTES) {
      await reader.cancel()
      throw new Error("decoded state too large")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function bytesToB64url(b: Uint8Array): string {
  let s = ""
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encodeState(state: ChartState): Promise<string> {
  const json = JSON.stringify(sanitizeState(state))
  const packed = await gzip(new TextEncoder().encode(json))
  return bytesToB64url(packed)
}

// Decode a `?d=` blob to a sanitized ChartState, or null on any malformation
// (bad base64, bad gzip, bad JSON, oversized, future version). The null lets
// callers that care (the /list page's "damaged link" notice) read the real
// outcome instead of inferring failure from an empty item list.
export async function decodeStateOrNull(d: string | null | undefined): Promise<ChartState | null> {
  if (!d) return null
  try {
    const json = new TextDecoder().decode(await gunzip(b64urlToBytes(d)))
    const raw = JSON.parse(json) as { v?: unknown }
    // A blob from a future codec version may carry different field semantics;
    // treat it as invalid rather than silently re-reading it under v1 rules.
    if (typeof raw?.v === "number" && raw.v > STATE_VERSION) return null
    return sanitizeState(raw)
  } catch {
    return null
  }
}

// Same, but a hostile or missing link degrades to emptyState() instead of null.
export async function decodeState(d: string | null | undefined): Promise<ChartState> {
  return (await decodeStateOrNull(d)) ?? emptyState()
}

export function chartIds(state: ChartState): string[] {
  return state.items
}

// One-cover share card: the builder's "Card" quick layout. Shared by the
// preset button, the album modal's Card action, and the ?album= unfurl image
// so the three can't drift. No rank numbers: a single card isn't a ranking.
export const CARD_PRESET: Partial<ChartState> = {
  cols: 1,
  rows: 1,
  textPos: "bottom",
  aspect: "portrait916",
  textAlign: "center",
  anchor: "center",
  coverSize: 4,
  numbered: false,
  numberText: false,
  wrap: true,
  bg: "art",
}

// `?d=` blob for a single album's card. portrait916 for story shares; the
// ?album= unfurl passes "square" (9:16 og:images crop badly in link previews).
export async function encodeCardState(id: string, aspect: string = "portrait916"): Promise<string> {
  return encodeState({ ...emptyState(), ...CARD_PRESET, items: [id], aspect })
}

// ── Shared caption + ornament styling (preview DOM + PNG export). The chart is
// rendered twice (JSX for the browser, Satori JSX for the PNG); everything
// that must not drift between the two lives here. ──

// Rank-number badge over the cover: a bottom gradient band with a large numeral.
// All lengths are fractions of the tile.
export const NUMBER_BADGE = {
  band: 0.42,
  padLeft: 0.06,
  padBottom: 0.035,
  fontSize: 0.2,
  gradient: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 100%)",
  ink: "#f0e6d6",
  textShadow: "0 1px 3px rgba(0,0,0,0.55)",
} as const

// "art" backdrop: first cover full-bleed, dimmed under a dark gradient, with a
// lift shadow on the covers.
export const ART_BACKDROP = {
  opacity: 0.22,
  gradient: "linear-gradient(180deg, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.78) 100%)",
  coverShadow: "0 24px 80px rgba(0,0,0,0.55)",
} as const

// One caption line. `bright` = title tier (semibold, fg ink); the rest render
// dim, artist italic.
export interface CaptionField {
  kind: "title" | "artist" | "label" | "date"
  text: string
  bright: boolean
  italic: boolean
}

// The caption lines for one album, with overrides and the rank-number rule
// applied. Single source of truth for WHICH lines exist and WHERE the number
// goes: the number prefixes the title, or the artist when the title is hidden,
// and nothing else (label/date lines are never numbered). A date line only
// exists when the album has a date; a label line only for hosted releases.
// `rank` is the 1-based rank, or null when this layout never numbers captions.
export function captionFields(
  s: ChartState,
  a: Pick<AlbumListItem, "title" | "artist" | "host_name" | "date">,
  ov: CaptionOverride | null | undefined,
  rank: number | null,
): CaptionField[] {
  const num = rank !== null && s.numberText ? `${rank}. ` : ""
  const fields: CaptionField[] = []
  if (s.showTitle) fields.push({ kind: "title", text: num + (ov?.t ?? a.title), bright: true, italic: false })
  if (s.showArtist) fields.push({ kind: "artist", text: (s.showTitle ? "" : num) + (ov?.a ?? a.artist), bright: false, italic: true })
  if (s.showLabel && isHostedRelease(a)) fields.push({ kind: "label", text: a.host_name!, bright: false, italic: false })
  if (s.showDate && a.date) fields.push({ kind: "date", text: formatDateShort(a.date, true), bright: false, italic: false })
  return fields
}

// Resolve a bg value (preset key or hex) to a concrete CSS color. The "theme"
// preset is intentionally returned as a CSS var so the in-app preview tracks
// the active theme; the export route passes a concrete hex instead.
export function resolveBg(bg: string, themeFallback = "var(--color-bg)"): string {
  switch (bg) {
    case "theme":
      return themeFallback
    case "art":
    case "black":
      return "#0a0a0a"
    case "slate":
      return "#13171f"
    case "oxblood":
      return "#250d10"
    case "parchment":
      return "#e8dcc0"
    case "bone":
      return "#d8d0c0"
    default:
      return isHexColor(bg) ? bg : themeFallback
  }
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 0
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Title + caption ink for a chart background, so text stays legible whatever bg
// the user picks (a light parchment bg needs dark ink even on a dark site
// theme). Shared by the in-app preview and the PNG export. "theme" defers to the
// caller's fallbacks (CSS vars in-app, concrete hex in the export route).
export function chartInk(
  bg: string,
  fgFallback = "var(--color-text-bright)",
  dimFallback = "var(--color-text-dim)",
): { fg: string; dim: string } {
  switch (bg) {
    case "theme":
      return { fg: fgFallback, dim: dimFallback }
    // Art sits text over a dimmed image, so the dim ink runs brighter than
    // black's to stay legible against busy artwork.
    case "art":
      return { fg: "#ece4d4", dim: "#b8ad9a" }
    case "black":
      return { fg: "#ece4d4", dim: "#9a8f7e" }
    case "slate":
      return { fg: "#e7ecf3", dim: "#8a93a3" }
    case "oxblood":
      return { fg: "#f0dcd8", dim: "#b0888a" }
    case "parchment":
      return { fg: "#3a3020", dim: "#6a5f48" }
    case "bone":
      return { fg: "#44403a", dim: "#6f6a60" }
    default:
      return luminance(bg) > 0.6 ? { fg: "#2a2520", dim: "#5a5346" } : { fg: "#ece4d4", dim: "#a89e8c" }
  }
}
