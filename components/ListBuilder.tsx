"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import BandcampImg from "@/components/BandcampImg"
import ListSearchAdd from "@/components/ListSearchAdd"
import { AlbumListItem, coverUrl } from "@/lib/types"
import { useOpenModal } from "@/lib/useModalUrl"
import { useShareLink } from "@/lib/useShareLink"
import { cacheAlbumStub } from "@/lib/albumCache"
import {
  DRAFT_KEY,
  type ListDraft as Draft,
  type SavedList,
  readSavedLists,
  saveList,
  deleteSavedList,
  readPending,
  clearPending,
  PENDING_KEY,
} from "@/lib/listDraft"
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
  fitBox,
  isHexColor,
  isHorizontalText,
  textScale,
  titleFontSize,
  frameBorder,
  autoCanvas,
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
  MIN_FRAME,
  MAX_FRAME,
  MAX_ITEMS,
  MAX_TITLE_LEN,
  CARD_PRESET,
  captionFields,
  NUMBER_BADGE,
  ART_BACKDROP,
  type CaptionOverride,
} from "@/lib/listCodec"

const BG_LABELS: Record<string, string> = { theme: "Theme", art: "Artwork", black: "Black", slate: "Slate", oxblood: "Oxblood", parchment: "Parchment", bone: "Bone" }
const ASPECT_LABELS: Record<string, string> = {
  auto: "Auto · fit content",
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
  linkInvalid = false,
}: {
  initialState: ChartState
  initialAlbums: AlbumListItem[]
  // The visited ?d= failed to decode: tell the recipient instead of silently
  // opening an empty builder.
  linkInvalid?: boolean
}) {
  const [state, setState] = useState<ChartState>(initialState)
  const [albums, setAlbums] = useState<Record<string, AlbumListItem>>(() =>
    Object.fromEntries(initialAlbums.map((a) => [a.id, a])),
  )
  const [encoded, setEncoded] = useState("")
  const addedIds = useMemo(() => new Set(state.items), [state.items])
  const openModal = useOpenModal()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  // Item (global index) whose caption is being edited in the panel under the
  // preview; the form lives outside the scale()-ed canvas so it stays usable.
  const [editIdx, setEditIdx] = useState<number | null>(null)
  // Preview page (overflow beyond cols×rows paginates); clamped against the
  // page count where it's consumed.
  const [pageRaw, setPage] = useState(0)

  // A `?d=` link opens as a read-only shared view, with the builder one tap
  // away. The author reloading their own link goes straight to the builder
  // (the URL blob matches the local draft).
  const [editing, setEditing] = useState(initialState.items.length === 0)
  useEffect(() => {
    if (editing) return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      const draft = raw ? (JSON.parse(raw) as Draft) : null
      const d = new URLSearchParams(window.location.search).get("d")
      if (d && draft?.d === d) setEditing(true)
    } catch {
      /* corrupt draft: stay in view mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The "theme" backdrop resolves to a CSS var in the preview; the PNG route
  // needs the concrete hex so the download matches what the user sees. Track
  // it across theme switches (data-theme on <html>).
  const [themeBg, setThemeBg] = useState("")
  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim()
      setThemeBg(isHexColor(v) ? v : "")
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => mo.disconnect()
  }, [])

  const [saved, setSaved] = useState<SavedList[]>([])
  useEffect(() => {
    setSaved(readSavedLists())
  }, [])

  // Stash a list snapshot into "My lists". The single builder for the three
  // stash sites (restore, save, edit-shared), so the shape can't drift.
  const stashList = useCallback((d: string, s: ChartState, albs: AlbumListItem[]) => {
    setSaved(
      saveList({
        d,
        title: s.title.trim(),
        count: s.items.length,
        savedAt: Date.now(),
        albums: albs,
      }),
    )
  }, [])

  // The last draft is offered as an explicit "Resume" entry instead of
  // auto-loading, so a bare /list always starts fresh.
  const [draftEntry, setDraftEntry] = useState<{ state: ChartState; albums: AlbumListItem[] } | null>(null)
  const didRestore = useRef(false)
  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true
    if (initialState.items.length > 0) return
    // First visit on a touch device: default to a ranked list (one column,
    // text beside the covers) instead of the desktop grid.
    if (window.matchMedia("(pointer: coarse)").matches) {
      setState((s) => ({ ...s, cols: 1, rows: 10, textPos: "right" }))
    }
    // Albums queued via "+ List" on other pages are drained into the working
    // list by the effect below; here the queue is only peeked (it runs first)
    // to decide stash-vs-Resume for the old draft.
    const pending = readPending()
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as Draft
      decodeState(draft.d).then((s) => {
        if (s.items.length === 0) return
        if (pending.length > 0) {
          // The queue just started a new working list, which will overwrite
          // the draft on the first sync; stash the old draft in My lists so
          // nothing is ever lost.
          stashList(draft.d, s, draft.albums ?? [])
        } else {
          setDraftEntry({ state: s, albums: draft.albums ?? [] })
        }
      })
    } catch {
      /* ignore a corrupt draft */
    }
  }, [initialState.items.length, stashList])

  const resumeDraft = () => {
    if (!draftEntry) return
    // A queue-seeded working list would be replaced by the resume: stash it.
    if (state.items.length > 0) void saveCurrent()
    setAlbums(Object.fromEntries(draftEntry.albums.map((a) => [a.id, a])))
    setState(draftEntry.state)
    setDraftEntry(null)
  }

  // The encoded blob derives from `state` alone; `albums` is only snapshotted
  // into the draft, so it rides along via a ref instead of re-triggering the
  // encode. The debounce timer lives inside the effect (not a useDebounced
  // state copy) so a typing pause costs one render, not two.
  const albumsRef = useRef(albums)
  useEffect(() => {
    albumsRef.current = albums
  }, [albums])
  useEffect(() => {
    const t = setTimeout(() => {
      encodeState(state).then((d) => {
        setEncoded(d)
        const sp = new URLSearchParams(window.location.search)
        // Empty lists encode to a non-empty blob too; keep a bare /list bare.
        if (d && state.items.length > 0) sp.set("d", d)
        else sp.delete("d")
        const qs = sp.toString()
        window.history.replaceState(null, "", `/list${qs ? `?${qs}` : ""}`)
        // Viewing someone else's list must not clobber the local draft, and
        // neither must an empty fresh session (the draft stays resumable).
        if (!editing || state.items.length === 0) return
        const draft: Draft = { d, albums: state.items.map((id) => albumsRef.current[id]).filter(Boolean) }
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        } catch {
          /* quota / private mode: draft simply isn't persisted */
        }
      })
    }, 300)
    return () => clearTimeout(t)
  }, [state, editing])

  const addAlbum = useCallback((a: AlbumListItem) => {
    setState((s) => {
      if (s.items.length >= MAX_ITEMS || s.items.includes(a.id)) return s
      return { ...s, items: [...s.items, a.id] }
    })
    setAlbums((m) => (m[a.id] ? m : { ...m, [a.id]: a }))
    // Jump the preview to wherever the new cover lands (clamped to the last
    // page), so an add is never invisible.
    setPage(Number.MAX_SAFE_INTEGER)
  }, [])

  // "Add to list" from the album modal (any page). Claiming the event tells
  // lib/listDraft not to write the queue itself; addAlbum updates state and
  // the sync effect persists it. The verdict rides back on the event so the
  // modal can show "In list ✓" instead of pretending a duplicate was added.
  useEffect(() => {
    if (!editing) return
    const onAdd = (e: Event) => {
      const ce = e as CustomEvent<AlbumListItem> & { dsResult?: string }
      if (!ce.detail?.id) return
      ce.preventDefault()
      if (addedIds.has(ce.detail.id)) {
        ce.dsResult = "exists"
      } else if (addedIds.size >= MAX_ITEMS) {
        ce.dsResult = "full"
      } else {
        addAlbum(ce.detail)
        ce.dsResult = "added"
      }
    }
    const onHas = (e: Event) => {
      const ce = e as CustomEvent<string> & { dsHas?: boolean }
      if (typeof ce.detail === "string") ce.dsHas = addedIds.has(ce.detail)
    }
    window.addEventListener("ds-list-add", onAdd)
    window.addEventListener("ds-list-has", onHas)
    return () => {
      window.removeEventListener("ds-list-add", onAdd)
      window.removeEventListener("ds-list-has", onHas)
    }
  }, [editing, addAlbum, addedIds])

  const drainPending = useCallback(() => {
    const pending = readPending()
    if (pending.length === 0) return
    clearPending()
    pending.forEach((a) => addAlbum(a))
  }, [addAlbum])

  // Drain the "+ List" queue into whichever list is being edited, the moment
  // one is: bare-mount (fresh list), author detection on a ?d= reload, or the
  // Edit tap on a shared link. Storage events don't fire in the tab that
  // wrote the queue, so this is the only same-tab consumption path.
  useEffect(() => {
    if (editing) drainPending()
  }, [editing, drainPending])

  // "+ List" clicked in ANOTHER tab: CustomEvents don't cross tabs, but
  // storage events do. Consume the queue live so the add shows up here.
  useEffect(() => {
    if (!editing) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === PENDING_KEY) drainPending()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [editing, drainPending])

  // Caption overrides travel with their item through every mutation, so the
  // texts array is padded to items length before any splice/swap.
  const paddedTexts = (s: ChartState) => {
    const t = [...s.texts]
    while (t.length < s.items.length) t.push(null)
    return t
  }

  const removeAt = useCallback((idx: number) => {
    setState((s) => ({
      ...s,
      items: s.items.filter((_, i) => i !== idx),
      texts: paddedTexts(s).filter((_, i) => i !== idx),
    }))
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    setState((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.items.length || to >= s.items.length) return s
      const items = [...s.items]
      const [m] = items.splice(from, 1)
      items.splice(to, 0, m)
      const texts = paddedTexts(s)
      const [mt] = texts.splice(from, 1)
      texts.splice(to, 0, mt)
      return { ...s, items, texts }
    })
  }, [])

  // An adjacent swap IS a reorder; keeping one mutation path keeps the texts
  // padding logic in one place. Follow the item across a page boundary so it
  // never moves out of view.
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= state.items.length) return
    reorder(idx, j)
    setPage(Math.floor(j / chartCapacity(state)))
  }

  // Caption override editor: an empty input falls back to the album's own
  // data. Raw value kept while typing; sanitizeState trims on encode.
  const setText = useCallback((gi: number, field: "t" | "a", v: string) => {
    setState((s) => {
      if (gi < 0 || gi >= s.items.length) return s
      const texts = paddedTexts(s)
      const cur = { ...(texts[gi] ?? {}) }
      const val = v.slice(0, MAX_TITLE_LEN)
      if (val.trim()) cur[field] = val
      else delete cur[field]
      texts[gi] = cur.t || cur.a ? cur : null
      return { ...s, texts }
    })
  }, [])

  const patch = useCallback((p: Partial<ChartState>) => setState((s) => ({ ...s, ...p })), [])

  // Clearing is the one destructive action with no way back, so it takes two
  // taps. The autosave skips empty lists (it would never overwrite the draft),
  // so the draft slot is wiped here explicitly; otherwise the cleared list
  // would resurrect as "Resume" on the next visit. Saved snapshots are separate
  // and untouched, so Save-before-Clear keeps anything worth keeping.
  const [confirmClear, setConfirmClear] = useState(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAll = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setConfirmClear(false), 2500)
      return
    }
    if (clearTimer.current) clearTimeout(clearTimer.current)
    setConfirmClear(false)
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* quota / private mode: nothing persisted to remove */
    }
    setState((s) => ({ ...s, items: [], texts: [], title: "" }))
  }, [confirmClear])
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current) }, [])

  // One-tap starting points. Each preset sets the full layout shape (so no
  // residue from the previous one); every option stays adjustable after.
  const applyPreset = useCallback((k: "grid" | "list" | "card") => {
    setState((s) => {
      if (k === "grid")
        return { ...s, cols: 5, rows: 5, textPos: "bottom", aspect: "auto", textAlign: "left", anchor: "center", coverSize: 5, wrap: false }
      if (k === "list")
        return {
          ...s,
          cols: 1,
          rows: Math.min(MAX_ROWS, Math.max(s.items.length, 5)),
          textPos: "right",
          aspect: "auto",
          textAlign: "left",
          anchor: "center",
          coverSize: 5,
          wrap: false,
        }
      // card: one big cover, text centred below, artwork backdrop, wrapped
      // captions, everything centred in the frame, like a player view.
      return { ...s, ...CARD_PRESET }
    })
  }, [])

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

  // Overflow becomes pages: cols×rows covers per page, one exported image per
  // page. Item indices passed to render/move/remove are global (offset+local)
  // so numbering and reordering work across pages.
  const cap = chartCapacity(state)
  const pages = Math.max(1, Math.ceil(count / cap))
  const page = Math.min(pageRaw, pages - 1)
  const offset = page * cap
  // addAlbum jumps with MAX_SAFE_INTEGER; settle the stored value onto the
  // real index so the view isn't permanently pinned to whatever page is last
  // as the list or grid changes.
  useEffect(() => {
    if (pageRaw > pages - 1) setPage(pages - 1)
  }, [pageRaw, pages])
  const visible = state.items.slice(offset, offset + cap)
  // Fixed shapes lay out at full capacity: the chosen cols×rows ARE the
  // chart's dimensions (empty slots show the skeleton), and tiles stay the
  // same size on every page. The "auto" shape hugs the actual content: the
  // canvas is exactly as big as the covers on this page, no dead space.
  const layoutCount = state.aspect === "auto" ? Math.max(1, visible.length) : cap
  // "art" backdrop mirrors the export: the page's first cover full-bleed,
  // dimmed under a dark gradient; covers get a shadow to lift off it. A
  // single-cover card reads its artist line at full ink, player-style.
  const artBgSrc = state.bg === "art" ? coverUrl(albums[visible[0]]?.art_id, "xl") : null
  const coverShadow = state.bg === "art" ? ART_BACKDROP.coverShadow : undefined
  // Album behind the caption editor; undefined (panel hidden) once the item
  // is gone, e.g. removed or cleared while the editor was open.
  const editAlbum = editIdx !== null && editIdx < state.items.length ? albums[state.items[editIdx]] : undefined
  const bgQs = state.bg === "theme" && themeBg ? `&bg=${encodeURIComponent(themeBg)}` : ""
  const pageQs = pages > 1 ? `&page=${page + 1}` : ""
  const downloadBase = encoded ? `/api/list/image?d=${encoded}${bgQs}${pageQs}` : null
  // The share link carries the resolved theme hex too, so the recipient's
  // unfurl (og:image, built server-side where the theme is unknowable) shows
  // the backdrop the author designed on.
  const shareUrl = encoded ? `/list?d=${encoded}${bgQs}` : null

  // Encode fresh at save time: `encoded` lags edits by the debounce, so a
  // Save right after an add would snapshot a blob missing it (with a count
  // that doesn't match the blob's content).
  const saveCurrent = async () => {
    if (state.items.length === 0) return
    const d = await encodeState(state)
    stashList(d, state, state.items.map((id) => albums[id]).filter(Boolean))
  }

  // The working list autosaves to the single draft slot; before anything
  // replaces it (loading a saved list, resuming, editing a shared link), the
  // about-to-be-lost list is stashed into My lists. Nothing is ever dropped
  // (saveList dedupes by payload, so re-stashing the same list is a no-op).
  const loadSaved = (s: SavedList) => {
    decodeState(s.d).then((st) => {
      if (st.items.length === 0) return
      // Loading the list that IS the current one needs no stash (and no encode).
      if (state.items.length > 0 && encoded !== s.d) void saveCurrent()
      setAlbums((m) => ({ ...m, ...Object.fromEntries((s.albums ?? []).map((a) => [a.id, a])) }))
      setState(st)
    })
  }

  // Editing a shared list makes it the working draft; stash the user's own
  // draft first (the viewer never wrote over it, so it's still in storage).
  const enterEdit = async () => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as Draft
        if (draft.d && draft.d !== encoded) {
          const s = await decodeState(draft.d)
          if (s.items.length > 0) stashList(draft.d, s, draft.albums ?? [])
        }
      }
    } catch {
      /* corrupt draft: nothing to stash */
    }
    setEditing(true)
  }

  // The preview IS the export: same canvas + tile (shared with the PNG
  // route), scaled to the available width. True WYSIWYG. "auto" hugs the
  // content (no dead space); fixed shapes fit the content into the frame.
  const ac = state.aspect === "auto" ? autoCanvas(state, layoutCount) : null
  const canvas = ac ? { w: ac.w, h: ac.h } : aspectCanvas(state.aspect)
  const centered = state.anchor === "center"
  // Stories overlay UI top and bottom; fit the content into the safe band
  // (same call as the export route, so the preview stays WYSIWYG).
  const box = fitBox(state.aspect, canvas.w, canvas.h)
  const TILE = ac ? ac.tile : chartTile(state, layoutCount, box.w, box.h)
  const bw = frameBorder(TILE, state.frameWidth)
  const pad = chartEdge(state, TILE)
  const L = measureChart(state, layoutCount, TILE, canvas.w - 2 * pad)
  const horiz = isHorizontalText(state.textPos)
  const ai = state.textAlign === "center" ? "center" : state.textAlign === "right" ? "flex-end" : "flex-start"

  // Scale the fixed canvas to fit the available width AND cap its height to the
  // settings panel (clamped to the viewport), so the box can be as tall as the
  // controls but never overflow the screen. Width follows the template.
  const stageRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(0)
  const [maxBoxH, setMaxBoxH] = useState(0)
  const capH = L.capH
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const compute = () => {
      const w = stage.clientWidth
      if (w <= 0) return
      const vh = (typeof window !== "undefined" ? window.innerHeight : 900) * 0.85
      if (!editing || !window.matchMedia("(min-width: 64rem)").matches) {
        // Phone: shape fidelity wins. Fit the whole canvas in the viewport so a
        // portrait or landscape frame reads as its true shape instead of being
        // scroll-cropped, and ignore the settings column (it's stacked, not
        // beside the preview).
        setMaxBoxH(vh)
        setScale(Math.min(1, w / canvas.w, vh / canvas.h))
        return
      }
      // Desktop: the whole canvas must fit (a portrait frame has to LOOK
      // portrait, not get scroll-cropped to a square), so height bounds the
      // scale too. The caption anchor (100% caption = release-feed 0.8rem)
      // stays as a ceiling so text never renders oversized; tall frames may
      // shrink captions below it, shape fidelity wins.
      const maxH = Math.min(asideRef.current?.offsetHeight ?? vh, vh)
      setMaxBoxH(maxH)
      const fontScale = capH > 0 ? 12.8 / (TILE * 0.075) : 1
      setScale(Math.min(1, w / canvas.w, maxH / canvas.h, fontScale))
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
    // hasItems: the stage div only exists once there are items, and a 0→1 item
    // change leaves TILE identical (measure clamps count to 1), so without it
    // the observer never attaches after a draft restore and scale stays 0.
  }, [canvas.w, canvas.h, TILE, capH, editing, hasItems])
  const boxW = Math.round(canvas.w * scale)

  const px = (n: number) => `${n}px`

  // The tile buttons sit inside the scale()-ed canvas, so their 24px DOM size
  // shrinks with it (~7px on a phone). Counter-scale them back toward their
  // natural size, capped so the four-button row still fits the tile.
  const btnScale = scale > 0 ? Math.min(1 / scale, TILE / 112) : 1

  const renderCover = (id: string, idx: number, showNum: boolean) => {
    const a = albums[id]
    const src = coverUrl(a?.art_id, "xl")
    return (
      <div
        draggable={editing}
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
        className={`group/cell relative bg-bg-card overflow-hidden transition-opacity ${
          editing ? "cursor-grab active:cursor-grabbing" : ""
        } ${dragIdx === idx ? "opacity-40 border border-accent" : ""}`}
        style={{
          width: px(TILE),
          height: px(TILE),
          boxShadow: coverShadow,
          // Drag feedback wins; otherwise the optional cover frame (export
          // matches via the route's cover(), same frameBorder()).
          border: dragIdx === idx ? undefined : bw > 0 ? `${bw}px solid ${ink.dim}` : undefined,
        }}
      >
        {src ? (
          <BandcampImg src={src} alt={a ? `${a.artist}, ${a.title}` : ""} decoding="async" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl text-border select-none" aria-hidden>♜</span>
        )}
        {showNum && state.numbered && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 flex items-end pointer-events-none"
            style={{
              height: px(Math.round(TILE * NUMBER_BADGE.band)),
              paddingLeft: px(Math.round(TILE * NUMBER_BADGE.padLeft)),
              paddingBottom: px(Math.round(TILE * NUMBER_BADGE.padBottom)),
              backgroundImage: NUMBER_BADGE.gradient,
            }}
          >
            <span
              className="font-display tabular-nums leading-none"
              style={{ fontSize: px(Math.round(TILE * NUMBER_BADGE.fontSize)), color: NUMBER_BADGE.ink, textShadow: NUMBER_BADGE.textShadow }}
            >
              {idx + 1}
            </span>
          </div>
        )}
        {editing && (
          <div
            className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity"
            style={{ transform: `scale(${btnScale})`, transformOrigin: "top right" }}
          >
            <TileBtn label="Move earlier" disabled={idx === 0} onClick={() => move(idx, -1)}>←</TileBtn>
            <TileBtn label="Move later" disabled={idx === count - 1} onClick={() => move(idx, 1)}>→</TileBtn>
            <TileBtn label="Edit caption" onClick={() => setEditIdx(idx)}>✎</TileBtn>
            <TileBtn label="Remove" onClick={() => { removeAt(idx); setEditIdx(null) }}>×</TileBtn>
          </div>
        )}
      </div>
    )
  }

  const renderCaption = (id: string, capW: number, idx: number, withNum: boolean) => {
    const a = albums[id]
    if (!a || L.capH <= 0) return null
    // Which lines exist and where the rank number goes comes from the shared
    // captionFields, so the preview cannot drift from the PNG export.
    const fields = captionFields(state, a, state.texts[idx], withNum ? idx + 1 : null)
    if (fields.length === 0) return null
    const clip = state.wrap ? "break-words" : "overflow-hidden whitespace-nowrap text-ellipsis"
    // Wrapped lines need the explicit alignment; the flex wrapper only places
    // the block, not the text inside it.
    const ta = state.textAlign as "left" | "center" | "right"
    // While editing, the caption is the text being designed: clicking it
    // opens the caption editor. The album modal stays a view-mode affordance
    // (the cover's ✎ button also opens the editor).
    const onCaption = editing ? () => setEditIdx(idx) : () => openAlbum(id)
    return (
      <div
        className="flex flex-col justify-center cursor-pointer transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        style={{ alignItems: ai, width: px(capW) }}
        onClick={onCaption}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onCaption()
          }
        }}
        role="button"
        tabIndex={0}
        title={editing ? "Edit caption" : "Open details"}
      >
        {fields.map((f, i) => (
          <div
            key={i}
            className={`${f.bright ? "font-medium" : ""} ${f.italic ? "italic" : ""} ${f.kind === "date" ? "tabular-nums" : ""} ${clip}`}
            style={{
              color: f.bright ? ink.fg : ink.dim,
              fontSize: px(f.bright ? L.capTitleFs : L.capSubFs),
              lineHeight: f.bright ? 1.3 : 1.32,
              maxWidth: px(capW),
              textAlign: ta,
            }}
          >
            {f.text}
          </div>
        ))}
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

  // Unfilled slots on the current page, drawn as faint outlines (preview only,
  // not exported) so the chosen grid dimensions stay visible.
  const emptySlots = Array.from({ length: Math.max(0, layoutCount - visible.length) }, (_, i) => (
    <li key={`empty-${i}`} className="flex items-start">
      <div
        aria-hidden
        className="border border-border/40"
        style={{ width: px(TILE), height: px(TILE), backgroundColor: "#00000022" }}
      />
    </li>
  ))

  // The cover grid <ol>: same wrapper for both text layouts, only the per-item
  // cell differs.
  const coverGridOl = (renderLi: (id: string, idx: number) => React.ReactNode) => (
    <ol className="flex flex-wrap list-none" style={{ gap: px(L.gap), width: px(L.gridW) }}>
      {visible.map(renderLi)}
      {emptySlots}
    </ol>
  )

  // Side text: one numbered list column beside the grid, rows aligned to grid rows.
  const sideText = horiz && L.capH > 0
  const textListEl = (
    <div className="flex flex-col" style={{ gap: px(L.gap), width: px(L.textColW) }}>
      {Array.from({ length: L.rows }).map((_, r) => (
        <div key={r} className="flex flex-col justify-center" style={{ height: px(L.cellH), gap: px(Math.round(TILE * 0.04)) }}>
          {visible.slice(r * L.cols, r * L.cols + L.cols).map((id, i) => (
            <div key={id}>{renderCaption(id, L.textColW, offset + r * L.cols + i, true)}</div>
          ))}
        </div>
      ))}
    </div>
  )

  const titleFs = titleFontSize(TILE, L.contentW, state.title)

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 flex flex-col lg:flex-row gap-6 lg:gap-10">
      {/* ─────────── Controls ─────────── */}
      {editing && (
      <aside ref={asideRef} className="lg:w-72 lg:shrink-0 flex flex-col gap-4">
        <ListSearchAdd onPick={addAlbum} addedIds={addedIds} />

        {/* My lists sit above the settings: resuming or loading a list is an
            entry point, not a setting. */}
        {(draftEntry || saved.length > 0 || hasItems) && (
        <div className="flex flex-col gap-2">
          <Eyebrow>My lists</Eyebrow>
          {/* The working list, pinned on top so it's clear what loading or
              resuming another list will replace. */}
          {hasItems && (
            <div className="flex flex-col gap-0.5 px-3 py-2 border border-accent/50">
              <span className="truncate font-sans text-xs text-text-bright italic">{state.title.trim() || "Untitled list"}</span>
              <span className="font-display text-[9px] tracking-[0.15em] uppercase text-accent/80 tabular-nums">
                Current · {count} {count === 1 ? "release" : "releases"}
              </span>
            </div>
          )}
          {draftEntry && !hasItems && (
            <PillBtn onClick={resumeDraft}>
              ↻ Resume last list ({draftEntry.state.items.length})
            </PillBtn>
          )}
          <PillBtn onClick={() => void saveCurrent()} disabled={!hasItems}>♟ Save this list</PillBtn>
          <p className="font-sans text-[11px] italic leading-snug text-text-dim">
            The list you are editing autosaves in this browser. Save keeps a separate snapshot here; Copy link keeps a
            list anywhere else.
          </p>
          {saved.map((s) => (
            <div key={s.d} className="flex items-stretch border border-border/40">
              <button
                type="button"
                onClick={() => loadSaved(s)}
                title="Load this list"
                className="flex-1 min-w-0 px-3 py-2 text-left flex flex-col gap-0.5 transition-colors hover:bg-bg-hover cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
              >
                <span className="truncate font-sans text-xs text-text-bright italic">{s.title || "Untitled list"}</span>
                <span className="font-display text-[9px] tracking-[0.15em] uppercase text-text-dim tabular-nums">
                  {s.count} {s.count === 1 ? "release" : "releases"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSaved(deleteSavedList(s.d))}
                aria-label={`Delete saved list ${s.title || "Untitled list"}`}
                className="shrink-0 w-9 flex items-center justify-center border-l border-border/40 text-sm text-text-dim hover:text-accent hover:bg-bg-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        )}

        <div className="bg-bg-card border border-border flex flex-col">
          <Field label="Quick layout">
            <div className="flex gap-2">
              {(["grid", "list", "card"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => applyPreset(k)}
                  className="flex-1 px-2 py-1.5 border border-border/50 font-display text-[10px] tracking-[0.15em] uppercase text-text-dim hover:text-accent hover:border-accent/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={state.title}
              maxLength={MAX_TITLE_LEN}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="My favourite releases"
              className={TEXT_INPUT}
            />
          </Field>

          <Section title="Layout">
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
          <Field label="Border" value={state.frameWidth === 0 ? "Off" : state.frameWidth}>
            <Slider min={MIN_FRAME} max={MAX_FRAME} value={state.frameWidth} onChange={(v) => patch({ frameWidth: v })} label="Border" />
          </Field>
          </Section>

          <Section title="Text">
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
          </Section>

          <Section title="Footer">
          <Toggle label="Show wordmark" checked={state.footer} onChange={(v) => patch({ footer: v })} />
          </Section>
        </div>

        {hasItems && (
          <button
            type="button"
            onClick={clearAll}
            className={`self-start font-display text-[10px] tracking-[0.2em] uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 ${
              confirmClear ? "text-accent" : "text-text-dim hover:text-accent"
            }`}
          >
            {confirmClear ? "✕ Really clear? Tap again" : "↺ Clear all"}
          </button>
        )}
      </aside>
      )}

      {/* ─────────── Preview ─────────── */}
      <div className="flex-1 min-w-0 order-first lg:order-none">
        <div
          className={`flex items-center justify-between mb-2 ${editing ? "mx-auto lg:mx-0" : "mx-auto"}`}
          style={hasItems && scale > 0 ? { width: px(boxW) } : undefined}
        >
          <Eyebrow>{editing ? "Preview" : "Shared list"}</Eyebrow>
          {hasItems && (
            <span className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim tabular-nums">
              {pages > 1 ? `${count} releases · ${pages} pages` : `${count} ${count === 1 ? "release" : "releases"}`}
            </span>
          )}
        </div>

        {!hasItems ? (
          <div
            className="border border-border flex flex-col items-center justify-center gap-3 py-20 sm:py-28"
            style={{ backgroundColor: previewBg, color: ink.dim }}
          >
            <span className="text-3xl select-none" aria-hidden>❧</span>
            {linkInvalid ? (
              <>
                <span className="font-display text-xs tracking-[0.2em] uppercase">This share link is damaged or incomplete</span>
                <span className="font-sans text-[11px] italic">Ask for the link again, or start a list of your own below.</span>
              </>
            ) : (
              <span className="font-display text-xs tracking-[0.2em] uppercase">Search to add releases you love</span>
            )}
          </div>
        ) : (
          <div
            ref={stageRef}
            className={`w-full overflow-x-hidden overflow-y-auto flex flex-col items-center ${editing ? "lg:items-start" : ""}`}
            style={{ maxHeight: maxBoxH ? px(maxBoxH) : undefined, scrollbarWidth: "none" }}
          >
            {/* Until the first measure, reserve a correctly-shaped box so the
                chart doesn't pop in from nothing (and nothing shifts). */}
            <div
              className="border border-border overflow-hidden"
              style={
                scale > 0
                  ? { width: px(canvas.w * scale), height: px(canvas.h * scale) }
                  : { width: "100%", aspectRatio: `${canvas.w} / ${canvas.h}`, maxHeight: "85vh" }
              }
            >
              <div
                className="relative origin-top-left"
                style={{ width: px(canvas.w), height: px(canvas.h), transform: `scale(${scale})`, backgroundColor: previewBg }}
              >
                {artBgSrc && (
                  <>
                    <BandcampImg
                      src={artBgSrc}
                      alt=""
                      aria-hidden
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ opacity: ART_BACKDROP.opacity }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{ backgroundImage: ART_BACKDROP.gradient }}
                    />
                  </>
                )}
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
                          className="font-display uppercase text-center whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ color: ink.fg, fontSize: px(titleFs), letterSpacing: "0.07em", maxWidth: px(L.contentW) }}
                        >
                          {state.title}
                        </div>
                        <span
                          aria-hidden
                          className="block"
                          style={{ width: px(Math.round(TILE * 0.6)), height: 1, backgroundColor: ink.dim, marginTop: px(Math.round(TILE * 0.07)) }}
                        />
                      </div>
                    )}
                    {sideText ? (
                      <div className="flex flex-row" style={{ gap: px(L.gap), width: px(L.contentW) }}>
                        {state.textPos === "left" && textListEl}
                        {coverGridOl((id, idx) => (
                          <li key={id} className="flex items-center" style={{ height: px(L.cellH) }}>
                            {renderCover(id, offset + idx, true)}
                          </li>
                        ))}
                        {state.textPos === "right" && textListEl}
                      </div>
                    ) : (
                      coverGridOl((id, idx) => <li key={id}>{renderVCell(id, offset + idx)}</li>)
                    )}
                    {state.footer && (
                      <div
                        className="flex items-center"
                        style={{ marginTop: px(Math.round(TILE * 0.14)), gap: px(Math.round(TILE * 0.045)) }}
                      >
                        <span
                          aria-hidden
                          className="block"
                          style={{ width: px(Math.round(TILE * 0.028)), height: px(Math.round(TILE * 0.028)), border: `1px solid ${ink.dim}`, transform: "rotate(45deg)" }}
                        />
                        <span
                          className="font-display uppercase"
                          style={{ color: ink.dim, fontSize: px(Math.round(TILE * 0.05)), letterSpacing: "0.25em" }}
                        >
                          Dungeon Synth Releases
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action bar: belongs to the artifact, aligned to the chart box
            (whatever its shape) instead of floating centered below it. */}
        {(!editing || hasItems) && (
          <div
            className={`mt-3 flex flex-wrap items-center gap-2 ${editing ? "mx-auto lg:mx-0" : "mx-auto justify-center"}`}
            style={scale > 0 ? { width: px(boxW) } : undefined}
          >
            {!editing && (
              <ActionBtn accent onClick={() => void enterEdit()}>
                ✎ Edit
              </ActionBtn>
            )}
            <ShareLinkAction shareUrl={shareUrl} title={state.title.trim() || "Dungeon synth list"} />
            <DownloadAction href={downloadBase} filename={`dungeon-synth-list${pages > 1 ? `-p${page + 1}` : ""}.png`} />
          </div>
        )}

        {/* Proxies and CDNs commonly cap request lines around 8KB; past that
            the link and the og:image stop resolving even though the local
            preview still works. */}
        {encoded.length > 7500 && (
          <p
            className={`mt-2 font-sans text-[11px] italic leading-snug text-accent/80 ${editing ? "mx-auto lg:mx-0" : "mx-auto text-center"}`}
            style={scale > 0 ? { width: px(boxW) } : undefined}
          >
            This list is too large to travel reliably as a link. Trim some releases or shorten custom captions before
            sharing.
          </p>
        )}

        {/* Caption override editor (✎ on a tile). Lives outside the scaled
            canvas so the inputs render at natural size; aligned to the chart
            box like the action bar. Empty input = album's own data. The key
            remounts the editor when the target changes, reseeding its inputs. */}
        {editing && editAlbum && editIdx !== null && (
          <CaptionEditor
            key={`${editIdx}:${editAlbum.id}`}
            idx={editIdx}
            album={editAlbum}
            ov={state.texts[editIdx]}
            width={scale > 0 ? boxW : undefined}
            onSet={setText}
            onClose={() => setEditIdx(null)}
          />
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <TileBtn className="tap-target" label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>←</TileBtn>
            <span className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim tabular-nums">
              Page {page + 1} / {pages}
            </span>
            <TileBtn className="tap-target" label="Next page" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>→</TileBtn>
          </div>
        )}

        {!editing && (
          <p className="mt-4 text-center font-sans text-[11px] italic leading-snug text-text-dim">
            Made with the{" "}
            <a href="/list" className="underline underline-offset-2 hover:text-accent transition-colors">
              list builder
            </a>
            , make your own.
          </p>
        )}
      </div>
    </div>
  )
}

// Caption override editor: the fields are seeded with the effective text
// (easier to trim a catalog prefix than retype a title); local state keeps
// the input stable while typing, and the parent's key remounts the editor
// when the edit target changes. Text matching the original stores no override.
const TEXT_INPUT =
  "w-full bg-transparent pb-1 border-b border-border/50 text-base sm:text-sm text-text-bright italic font-sans placeholder:text-text-dim/50 placeholder:not-italic focus:outline-none focus-visible:outline-none focus:border-accent/60 transition-colors"

function CaptionEditor({
  idx,
  album,
  ov,
  width,
  onSet,
  onClose,
}: {
  idx: number
  album: AlbumListItem
  ov: CaptionOverride | null | undefined
  width?: number
  onSet: (idx: number, field: "t" | "a", v: string) => void
  onClose: () => void
}) {
  const [t, setT] = useState(ov?.t ?? album.title)
  const [a, setA] = useState(ov?.a ?? album.artist)
  return (
    <div
      className="mt-3 mx-auto lg:mx-0 bg-bg-card border border-border px-3 py-2.5 flex flex-col gap-2"
      style={width ? { width: `${width}px` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Edit caption · {idx + 1}. {album.artist}</Eyebrow>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close caption editor"
          className="tap-target shrink-0 w-6 h-6 flex items-center justify-center text-sm text-text-dim hover:text-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        >
          ×
        </button>
      </div>
      <input
        type="text"
        value={t}
        maxLength={MAX_TITLE_LEN}
        onChange={(e) => {
          const v = e.target.value
          setT(v)
          onSet(idx, "t", v === album.title ? "" : v)
        }}
        placeholder={album.title}
        aria-label="Custom title"
        className={TEXT_INPUT}
      />
      <input
        type="text"
        value={a}
        maxLength={MAX_TITLE_LEN}
        onChange={(e) => {
          const v = e.target.value
          setA(v)
          onSet(idx, "a", v === album.artist ? "" : v)
        }}
        placeholder={album.artist}
        aria-label="Custom artist"
        className={TEXT_INPUT}
      />
      <p className="font-sans text-[11px] italic leading-snug text-text-dim">
        Shown on this chart only; the release itself is untouched. Restore the original text (or empty the field)
        to drop the override.
      </p>
    </div>
  )
}

/* ─────────── control atoms ─────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">{children}</span>
}

// Collapsible settings group. Until the user toggles it, `open` is null and the
// body visibility is pure CSS (open on desktop, collapsed on mobile), so the
// server and hydration renders agree on every device.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null)
  // Resolve the CSS-driven initial state after mount so aria-expanded reflects
  // what is actually visible (desktop open, mobile collapsed) instead of being
  // absent until the first toggle.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen((o) => (o === null ? window.matchMedia("(min-width: 64rem)").matches : o))
  }, [])
  const toggle = () => setOpen((o) => (o === null ? !window.matchMedia("(min-width: 64rem)").matches : !o))
  const body = open === null ? "hidden lg:flex" : open ? "flex" : "hidden"
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open ?? undefined}
        className="w-full px-4 pt-4 pb-1.5 flex items-center gap-2 select-none cursor-pointer group/sec focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <span aria-hidden className="text-[7px] leading-none text-accent/50">◆</span>
        <span className="font-display text-[9px] tracking-[0.28em] uppercase text-accent/70 transition-colors group-hover/sec:text-accent">{title}</span>
        <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-border/60 to-transparent" />
        <span aria-hidden className="text-[8px] leading-none text-text-dim">
          {open === null ? (
            <>
              <span className="lg:hidden">▸</span>
              <span className="hidden lg:inline">▾</span>
            </>
          ) : open ? (
            "▾"
          ) : (
            "▸"
          )}
        </span>
      </button>
      <div className={`${body} flex-col`}>{children}</div>
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
  className = "",
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-6 h-6 flex items-center justify-center text-sm leading-none text-text-dim bg-bg-card/90 border border-border hover:text-accent hover:border-accent disabled:opacity-30 disabled:hover:text-text-dim disabled:hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 ${className}`}
    >
      {children}
    </button>
  )
}

/* Compact action-bar atoms: auto-width pills that sit in a row under the
   chart, aligned to its box. */
const ACTION_BASE = "px-3 py-1.5 border font-display text-[10px] tracking-[0.15em] uppercase transition-colors whitespace-nowrap"
const ACTION_OFF = `${ACTION_BASE} border-border/40 text-text-dim/60 cursor-not-allowed`
const ACTION_ON = `${ACTION_BASE} cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60`

function ActionBtn({
  onClick,
  disabled,
  accent,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  children: React.ReactNode
}) {
  if (disabled) return <span className={ACTION_OFF}>{children}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ACTION_ON} ${
        accent ? "border-accent/60 text-accent hover:bg-accent/10" : "border-border/50 text-text hover:border-accent/60 hover:text-accent"
      }`}
    >
      {children}
    </button>
  )
}

// Download via fetch -> blob so the seconds-long cold render has visible
// progress and a failure (429/500) surfaces in-app instead of navigating the
// tab to a raw error body.
function DownloadAction({ href, filename }: { href: string | null; filename: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const download = async () => {
    if (!href || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const r = await fetch(href)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  if (!href) return <span className={ACTION_OFF}>↓ Download</span>
  return (
    <button
      type="button"
      onClick={() => void download()}
      aria-busy={busy}
      className={`${ACTION_ON} ${failed ? "border-accent/60 text-accent" : "border-border/50 text-text hover:border-accent/60 hover:text-accent"}`}
    >
      {busy ? "Rendering image…" : failed ? "Failed, tap to retry ↓" : "↓ Download"}
    </button>
  )
}

// Share = the list LINK (native sheet where it exists, clipboard otherwise).
// The image is shared by downloading it (the Download pill) and posting the
// file from the gallery; in-page image shares to Instagram et al. proved
// unreliable (targets latch onto any URL and refuse it).
function ShareLinkAction({ shareUrl, title }: { shareUrl: string | null; title: string }) {
  const { copied, share } = useShareLink(1500)

  if (!shareUrl) return <span className={ACTION_OFF}>⤴ Share link</span>
  return (
    <button
      type="button"
      onClick={() => void share(`${window.location.origin}${shareUrl}`, title)}
      className={`${ACTION_ON} ${copied ? "border-accent/60 text-accent" : "border-border/50 text-text hover:border-accent/60 hover:text-accent"}`}
    >
      {copied ? "Link copied ✓" : "⤴ Share link"}
    </button>
  )
}

function PillBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  const base = "block w-full text-center px-4 py-2 border font-display text-[10px] tracking-[0.2em] uppercase transition-colors"
  if (disabled) return <span className={`${base} border-border/40 text-text-dim/60 cursor-not-allowed`}>{children}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border-border/50 text-text hover:border-accent/60 hover:text-accent cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60`}
    >
      {children}
    </button>
  )
}

