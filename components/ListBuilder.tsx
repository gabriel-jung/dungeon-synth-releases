"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import BandcampImg from "@/components/BandcampImg"
import ListSearchAdd from "@/components/ListSearchAdd"
import { AlbumListItem, coverUrl, formatDateShort, isHostedRelease } from "@/lib/types"
import { useOpenModal } from "@/lib/useModalUrl"
import { cacheAlbumStub } from "@/lib/albumCache"
import {
  ChartState,
  decodeState,
  encodeState,
  resolveBg,
  chartInk,
  chartCapacity,
  measureChart,
  chartTile,
  chartEdge,
  aspectCanvas,
  isHorizontalText,
  textScale,
  ASPECTS,
  BG_PRESETS,
  TEXT_POSITIONS,
  TEXT_ALIGNS,
  MIN_TEXT_SIZE,
  MAX_TEXT_SIZE,
  MIN_COVER,
  MAX_COVER,
  COVER_FRACS,
  MIN_COLS,
  MAX_COLS,
  MIN_ROWS,
  MAX_ROWS,
  MIN_GAP,
  MAX_GAP,
  MAX_ITEMS,
  MAX_TITLE_LEN,
} from "@/lib/listCodec"

const DRAFT_KEY = "ds-list-draft-v1"
type Draft = { d: string; albums: AlbumListItem[] }

const BG_LABELS: Record<string, string> = { theme: "Theme", black: "Black", parchment: "Parchment", bone: "Bone" }
const ASPECT_LABELS: Record<string, string> = {
  square: "Square · 1:1",
  portrait45: "Portrait · 4:5",
  portrait916: "Portrait · 9:16",
  landscape43: "Landscape · 4:3",
  landscape169: "Landscape · 16:9",
}
const POS_LABELS: Record<string, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" }
const ANCHORS = ["topleft", "center"] as const
const ANCHOR_LABELS: Record<string, string> = { topleft: "Top-left", center: "Center" }
const ALIGN_LABELS: Record<string, string> = { left: "Left", center: "Center", right: "Right" }
const coverLabel = (n: number) => `${Math.round((COVER_FRACS[n] ?? 1) * 100)}%`

export default function ListBuilder({
  initialState,
  initialAlbums,
}: {
  initialState: ChartState
  initialAlbums: AlbumListItem[]
}) {
  const [state, setState] = useState<ChartState>(initialState)
  const [albums, setAlbums] = useState<Record<string, AlbumListItem>>(() =>
    Object.fromEntries(initialAlbums.map((a) => [a.id, a])),
  )
  const [encoded, setEncoded] = useState("")
  const addedIds = useMemo(() => new Set(state.items), [state.items])
  const openModal = useOpenModal()
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const didRestore = useRef(false)
  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true
    if (initialState.items.length > 0) return
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(DRAFT_KEY) : null
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as Draft
      decodeState(draft.d).then((s) => {
        if (s.items.length === 0) return
        setAlbums(Object.fromEntries((draft.albums ?? []).map((a) => [a.id, a])))
        setState(s)
      })
    } catch {
      /* ignore a corrupt draft */
    }
  }, [initialState.items.length])

  useEffect(() => {
    const t = setTimeout(() => {
      encodeState(state).then((d) => {
        setEncoded(d)
        const sp = new URLSearchParams(window.location.search)
        if (d) sp.set("d", d)
        else sp.delete("d")
        const qs = sp.toString()
        window.history.replaceState(null, "", `/list${qs ? `?${qs}` : ""}`)
        const draft: Draft = { d, albums: state.items.map((id) => albums[id]).filter(Boolean) }
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        } catch {
          /* quota / private mode: draft simply isn't persisted */
        }
      })
    }, 300)
    return () => clearTimeout(t)
  }, [state, albums])

  const addAlbum = useCallback((a: AlbumListItem) => {
    setState((s) => {
      if (s.items.length >= MAX_ITEMS || s.items.includes(a.id)) return s
      return { ...s, items: [...s.items, a.id] }
    })
    setAlbums((m) => (m[a.id] ? m : { ...m, [a.id]: a }))
  }, [])

  const removeAt = useCallback((idx: number) => {
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }))
  }, [])

  const move = useCallback((idx: number, dir: -1 | 1) => {
    setState((s) => {
      const j = idx + dir
      if (j < 0 || j >= s.items.length) return s
      const items = [...s.items]
      ;[items[idx], items[j]] = [items[j], items[idx]]
      return { ...s, items }
    })
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    setState((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.items.length || to >= s.items.length) return s
      const items = [...s.items]
      const [m] = items.splice(from, 1)
      items.splice(to, 0, m)
      return { ...s, items }
    })
  }, [])

  const patch = useCallback((p: Partial<ChartState>) => setState((s) => ({ ...s, ...p })), [])
  const clearAll = useCallback(() => setState((s) => ({ ...s, items: [], title: "" })), [])

  const openAlbum = useCallback(
    (id: string) => {
      const a = albums[id]
      if (a) cacheAlbumStub(a)
      openModal("album", id)
    },
    [albums, openModal],
  )

  const previewBg = resolveBg(state.bg)
  const ink = chartInk(state.bg)
  const hasItems = state.items.length > 0
  const count = state.items.length
  const visible = state.items.slice(0, chartCapacity(state))
  const hidden = count - visible.length
  const downloadBase = encoded ? `/api/list/image?d=${encoded}` : null

  // The preview IS the export: same fixed canvas + auto-fit tile (shared with
  // the PNG route), scaled to the available width. True WYSIWYG.
  const canvas = aspectCanvas(state.aspect)
  const centered = state.anchor === "center"
  const TILE = chartTile(state, visible.length, canvas.w, canvas.h)
  const pad = chartEdge(state, TILE)
  const L = measureChart(state, visible.length, TILE, canvas.w - 2 * pad)
  const horiz = isHorizontalText(state.textPos)
  const ai = state.textAlign === "center" ? "center" : state.textAlign === "right" ? "flex-end" : "flex-start"

  // Scale the fixed canvas to fit the available width AND cap its height to the
  // settings panel (clamped to the viewport), so the box can be as tall as the
  // controls but never overflow the screen. Width follows the template.
  const stageRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(0)
  const [maxBoxH, setMaxBoxH] = useState(0)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const compute = () => {
      const w = stage.clientWidth
      if (w <= 0) return
      const vh = (typeof window !== "undefined" ? window.innerHeight : 900) * 0.85
      setMaxBoxH(Math.min(asideRef.current?.offsetHeight ?? vh, vh))
      // Scale so a 100% caption renders at the release-feed size (0.8rem); the
      // box height is bounded by a scroll container, not by shrinking the text.
      const fontScale = 12.8 / (TILE * 0.075)
      setScale(Math.min(1, w / canvas.w, fontScale))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(stage)
    if (asideRef.current) ro.observe(asideRef.current)
    window.addEventListener("resize", compute)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", compute)
    }
  }, [canvas.w, canvas.h, TILE])
  const boxW = Math.round(canvas.w * scale)

  const px = (n: number) => `${n}px`

  const renderCover = (id: string, idx: number, showNum: boolean) => {
    const a = albums[id]
    const src = coverUrl(a?.art_id, "xl")
    return (
      <div
        draggable
        onDragStart={(e) => {
          setDragIdx(idx)
          e.dataTransfer.effectAllowed = "move"
        }}
        onDragEnd={() => setDragIdx(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (dragIdx !== null) reorder(dragIdx, idx)
          setDragIdx(null)
        }}
        className={`group/cell relative bg-bg-card border overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${
          dragIdx === idx ? "opacity-40 border-accent" : "border-border"
        }`}
        style={{ width: px(TILE), height: px(TILE) }}
      >
        {src ? (
          <BandcampImg src={src} alt={a ? `${a.artist} — ${a.title}` : ""} decoding="async" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl text-border select-none" aria-hidden>♜</span>
        )}
        {showNum && state.numbered && (
          <span
            className="absolute top-0 left-0 font-display tabular-nums text-white"
            style={{
              fontSize: px(Math.round(TILE * 0.09)),
              padding: `${Math.round(TILE * 0.01)}px ${Math.round(TILE * 0.04)}px`,
              backgroundColor: "#000000b0",
            }}
          >
            {idx + 1}
          </span>
        )}
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 transition-opacity">
          <TileBtn label="Move earlier" disabled={idx === 0} onClick={() => move(idx, -1)}>←</TileBtn>
          <TileBtn label="Move later" disabled={idx === visible.length - 1} onClick={() => move(idx, 1)}>→</TileBtn>
          <TileBtn label="Remove" onClick={() => removeAt(idx)}>×</TileBtn>
        </div>
      </div>
    )
  }

  const renderCaption = (id: string, capW: number, idx: number, withNum: boolean) => {
    const a = albums[id]
    if (!a || L.capH <= 0) return null
    const hasLabel = state.showLabel && isHostedRelease(a)
    const clip = state.wrap ? "break-words" : "overflow-hidden whitespace-nowrap text-ellipsis"
    const num = withNum && state.numberText ? `${idx + 1}. ` : ""
    const titleText = num && state.showTitle ? num + a.title : a.title
    const artistText = num && !state.showTitle && state.showArtist ? num + a.artist : a.artist
    const cs = (fs: number) => ({ color: ink.dim, fontSize: px(fs), lineHeight: 1.32, maxWidth: px(capW) }) as const
    return (
      <div
        className="flex flex-col justify-center cursor-pointer transition-opacity hover:opacity-70"
        style={{ alignItems: ai, width: px(capW) }}
        onClick={() => openAlbum(id)}
        role="button"
        title="Open details"
      >
        {state.showTitle && <div className={`font-medium ${clip}`} style={{ color: ink.fg, fontSize: px(L.capTitleFs), lineHeight: 1.3, maxWidth: px(capW) }}>{titleText}</div>}
        {state.showArtist && <div className={clip} style={cs(L.capSubFs)}>{artistText}</div>}
        {hasLabel && <div className={clip} style={cs(L.capSubFs)}>{a.host_name}</div>}
        {state.showDate && a.date && <div className={`tabular-nums ${clip}`} style={cs(L.capSubFs)}>{formatDateShort(a.date, true)}</div>}
      </div>
    )
  }

  // Vertical text: caption under/over each cover, inside the grid.
  const renderVCell = (id: string, idx: number) => {
    const cap = renderCaption(id, TILE, idx, false)
    const before = state.textPos === "top"
    return (
      <div className="flex flex-col" style={{ alignItems: ai, gap: px(Math.round(TILE * 0.045)), width: px(TILE) }}>
        {before && cap}
        {renderCover(id, idx, true)}
        {!before && cap}
      </div>
    )
  }

  // Side text: one numbered list column beside the grid, rows aligned to grid rows.
  const sideText = horiz && L.capH > 0
  const textListEl = (
    <div className="flex flex-col" style={{ gap: px(L.gap), width: px(L.textColW) }}>
      {Array.from({ length: L.rows }).map((_, r) => (
        <div key={r} className="flex flex-col justify-center" style={{ height: px(L.cellH), gap: px(Math.round(TILE * 0.04)) }}>
          {visible.slice(r * L.cols, r * L.cols + L.cols).map((id, i) => (
            <div key={id}>{renderCaption(id, L.textColW, r * L.cols + i, true)}</div>
          ))}
        </div>
      ))}
    </div>
  )

  const titleFs = Math.round(TILE * 0.13)

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 flex flex-col lg:flex-row gap-6 lg:gap-10">
      {/* ─────────── Controls ─────────── */}
      <aside ref={asideRef} className="lg:w-72 lg:shrink-0 flex flex-col gap-4">
        <ListSearchAdd onPick={addAlbum} addedIds={addedIds} />

        <div className="bg-bg-card border border-border flex flex-col">
          <Field label="Title">
            <input
              type="text"
              value={state.title}
              maxLength={MAX_TITLE_LEN}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="My favourite releases"
              className="w-full bg-transparent pb-1 border-b border-border/50 text-sm text-text-bright italic font-sans placeholder:text-text-dim/40 placeholder:not-italic focus:outline-none focus-visible:outline-none focus:border-accent/60 transition-colors"
            />
          </Field>

          <SectionLabel>Layout</SectionLabel>
          <Field label="Columns" value={state.cols}>
            <Slider min={MIN_COLS} max={MAX_COLS} value={state.cols} onChange={(v) => patch({ cols: v })} label="Columns" />
          </Field>
          <Field label="Rows" value={state.rows}>
            <Slider min={MIN_ROWS} max={MAX_ROWS} value={state.rows} onChange={(v) => patch({ rows: v })} label="Rows" />
          </Field>
          <Field label="Gap" value={state.gap}>
            <Slider min={MIN_GAP} max={MAX_GAP} value={state.gap} onChange={(v) => patch({ gap: v })} label="Gap" />
          </Field>
          <Field label="Cover size" value={coverLabel(state.coverSize)}>
            <Slider min={MIN_COVER} max={MAX_COVER} value={state.coverSize} onChange={(v) => patch({ coverSize: v })} label="Cover size" />
          </Field>
          <Select label="Shape" value={state.aspect} onChange={(v) => patch({ aspect: v })} options={ASPECTS} labels={ASPECT_LABELS} />
          <Select label="Frame position" value={state.anchor} onChange={(v) => patch({ anchor: v })} options={ANCHORS} labels={ANCHOR_LABELS} />
          <Select label="Backdrop" value={state.bg} onChange={(v) => patch({ bg: v })} options={BG_PRESETS} labels={BG_LABELS} />

          <SectionLabel>Text</SectionLabel>
          <Select label="Position" value={state.textPos} onChange={(v) => patch({ textPos: v })} options={TEXT_POSITIONS} labels={POS_LABELS} />
          <Select label="Align" value={state.textAlign} onChange={(v) => patch({ textAlign: v })} options={TEXT_ALIGNS} labels={ALIGN_LABELS} />
          <Field label="Text size" value={`${Math.round(textScale(state.textSize) * 100)}%`}>
            <Slider min={MIN_TEXT_SIZE} max={MAX_TEXT_SIZE} value={state.textSize} onChange={(v) => patch({ textSize: v })} label="Text size" />
          </Field>
          <Toggle label="Wrap text" checked={state.wrap} onChange={(v) => patch({ wrap: v })} />
          <Toggle label="Number on cover" checked={state.numbered} onChange={(v) => patch({ numbered: v })} />
          <Toggle label="Number in text" checked={state.numberText} onChange={(v) => patch({ numberText: v })} />
          <Toggle label="Show title" checked={state.showTitle} onChange={(v) => patch({ showTitle: v })} />
          <Toggle label="Show artist" checked={state.showArtist} onChange={(v) => patch({ showArtist: v })} />
          <Toggle label="Show label" checked={state.showLabel} onChange={(v) => patch({ showLabel: v })} />
          <Toggle label="Show date" checked={state.showDate} onChange={(v) => patch({ showDate: v })} />

          <SectionLabel>Footer</SectionLabel>
          <Toggle label="Show wordmark" checked={state.footer} onChange={(v) => patch({ footer: v })} />
        </div>

        <div className="flex flex-col gap-2">
          <Eyebrow>Share</Eyebrow>
          <CopyLinkButton href={encoded ? `/list?d=${encoded}` : null} />
          <PillLink href={downloadBase}>↓ Download image</PillLink>
          <p className="font-sans text-[11px] italic leading-snug text-text-dim">
            Copy the link to share this exact list, or download it as a PNG.
          </p>
        </div>

        {hasItems && (
          <button
            type="button"
            onClick={clearAll}
            className="self-start font-display text-[10px] tracking-[0.2em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
          >
            ↺ Clear all
          </button>
        )}
      </aside>

      {/* ─────────── Preview ─────────── */}
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center justify-between mb-2"
          style={hasItems && scale > 0 ? { width: px(boxW) } : undefined}
        >
          <Eyebrow>Preview</Eyebrow>
          {hasItems && (
            <span className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim tabular-nums">
              {hidden > 0 ? `${visible.length} of ${count} shown` : `${count} ${count === 1 ? "release" : "releases"}`}
            </span>
          )}
        </div>

        {!hasItems ? (
          <div
            className="border border-border flex flex-col items-center justify-center gap-3 py-20 sm:py-28"
            style={{ backgroundColor: previewBg, color: ink.dim }}
          >
            <span className="text-3xl select-none" aria-hidden>❧</span>
            <span className="font-display text-xs tracking-[0.2em] uppercase">Search to add releases you love</span>
          </div>
        ) : (
          <div
            ref={stageRef}
            className="w-full overflow-x-hidden overflow-y-auto"
            style={{ maxHeight: maxBoxH ? px(maxBoxH) : undefined, scrollbarWidth: "none" }}
          >
            <div className="border border-border overflow-hidden" style={{ width: px(canvas.w * scale), height: px(canvas.h * scale) }}>
              <div
                className="relative origin-top-left"
                style={{ width: px(canvas.w), height: px(canvas.h), transform: `scale(${scale})`, backgroundColor: previewBg }}
              >
                <div
                  className="absolute inset-0 flex flex-col"
                  style={{
                    padding: centered ? 0 : px(pad),
                    alignItems: centered ? "center" : "flex-start",
                    justifyContent: centered ? "center" : "flex-start",
                  }}
                >
                  <div className="flex flex-col" style={{ width: px(L.contentW), alignItems: centered ? "center" : "flex-start" }}>
                    {state.title.trim() && (
                      <div className="flex flex-col" style={{ alignItems: centered ? "center" : "flex-start", marginBottom: px(Math.round(TILE * 0.12)) }}>
                        <span
                          aria-hidden
                          className="block"
                          style={{
                            width: px(Math.round(TILE * 0.04)),
                            height: px(Math.round(TILE * 0.04)),
                            border: `2px solid ${ink.dim}`,
                            transform: "rotate(45deg)",
                            marginBottom: px(Math.round(TILE * 0.06)),
                          }}
                        />
                        <div
                          className="font-display uppercase text-center"
                          style={{ color: ink.fg, fontSize: px(titleFs), letterSpacing: "0.07em" }}
                        >
                          {state.title}
                        </div>
                      </div>
                    )}
                    {sideText ? (
                      <div className="flex flex-row" style={{ gap: px(L.gap), width: px(L.contentW) }}>
                        {state.textPos === "left" && textListEl}
                        <ol className="flex flex-wrap list-none" style={{ gap: px(L.gap), width: px(L.gridW) }}>
                          {visible.map((id, idx) => (
                            <li key={id} className="flex items-center" style={{ height: px(L.cellH) }}>
                              {renderCover(id, idx, true)}
                            </li>
                          ))}
                        </ol>
                        {state.textPos === "right" && textListEl}
                      </div>
                    ) : (
                      <ol className="flex flex-wrap list-none" style={{ gap: px(L.gap), width: px(L.gridW) }}>
                        {visible.map((id, idx) => (
                          <li key={id}>{renderVCell(id, idx)}</li>
                        ))}
                      </ol>
                    )}
                    {state.footer && (
                      <div
                        className="font-display uppercase"
                        style={{
                          color: ink.dim,
                          marginTop: px(Math.round(TILE * 0.14)),
                          fontSize: px(Math.round(TILE * 0.05)),
                          letterSpacing: "0.25em",
                        }}
                      >
                        Dungeon Synth Releases
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {hidden > 0 && (
          <p className="mt-3 text-center font-display text-[10px] tracking-[0.15em] uppercase text-text-dim">
            +{hidden} more not shown · raise rows or columns
          </p>
        )}
      </div>
    </div>
  )
}

/* ─────────── control atoms ─────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">{children}</span>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5 flex items-center gap-2 select-none">
      <span aria-hidden className="text-[7px] leading-none text-accent/50">◆</span>
      <span className="font-display text-[9px] tracking-[0.28em] uppercase text-accent/70">{children}</span>
      <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-border/60 to-transparent" />
    </div>
  )
}

function Field({ label, value, children }: { label: string; value?: number | string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        {value !== undefined && <span className="font-display text-[11px] text-accent/90 tabular-nums">{value}</span>}
      </span>
      {children}
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  labels: Record<string, string>
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-transparent pr-5 text-sm text-text-bright font-sans cursor-pointer focus:outline-none focus-visible:outline-none [&>option]:bg-bg-card [&>option]:text-text"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {labels[o] ?? o}
            </option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-text-dim">▾</span>
      </div>
    </Field>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-accent cursor-pointer focus-visible:outline-none"
    />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="group/tg px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-bg-hover/40">
      <Eyebrow>{label}</Eyebrow>
      <span
        className={`relative w-9 h-5 border transition-colors group-focus-within/tg:ring-1 group-focus-within/tg:ring-accent/60 ${
          checked ? "border-accent bg-accent/20" : "border-border bg-transparent group-hover/tg:border-accent/40"
        }`}
      >
        <span className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all ${checked ? "left-[1.1rem] bg-accent" : "left-0.5 bg-text-dim"}`} />
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      </span>
    </label>
  )
}

function TileBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center text-sm leading-none text-text-dim bg-bg-card/90 border border-border hover:text-accent hover:border-accent disabled:opacity-30 disabled:hover:text-text-dim disabled:hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
    >
      {children}
    </button>
  )
}

function CopyLinkButton({ href }: { href: string | null }) {
  const [copied, setCopied] = useState(false)
  const base = "block w-full text-center px-4 py-2 border font-display text-[10px] tracking-[0.2em] uppercase transition-colors"
  if (!href) return <span className={`${base} border-border/40 text-text-dim/40 cursor-not-allowed`}>⧉ Copy link</span>
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${href}`)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard blocked (insecure context / denied) */
        }
      }}
      className={`${base} ${copied ? "border-accent/60 text-accent" : "border-border/50 text-text hover:border-accent/60 hover:text-accent"} cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60`}
    >
      {copied ? "Link copied ✓" : "⧉ Copy link"}
    </button>
  )
}

function PillLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const base = "block w-full text-center px-4 py-2 border font-display text-[10px] tracking-[0.2em] uppercase transition-colors"
  if (!href) return <span className={`${base} border-border/40 text-text-dim/40 cursor-not-allowed`}>{children}</span>
  return (
    <a
      href={href}
      download
      className={`${base} border-border/50 text-text hover:border-accent/60 hover:text-accent cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60`}
    >
      {children}
    </a>
  )
}
