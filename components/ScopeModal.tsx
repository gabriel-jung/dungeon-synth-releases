"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AlbumListItem, coverUrl, hostImageUrl, safeExternalHref } from "@/lib/types"
import { closeModal, openModal, pushModalUrl, toQueryString } from "@/lib/modalUrl"
import { useModalSearchParams } from "@/lib/useModalUrl"
import { useResetOnChange } from "@/lib/useResetOnChange"
import type { TagContext } from "@/lib/tagContext"
import { getHostStub, getArtistArt } from "@/lib/albumCache"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ModalHeader from "./ModalHeader"
import ModalCloseButton from "./ModalCloseButton"
import ModalIconButton from "./ModalIconButton"
import ModalCountSubtitle from "./ModalCountSubtitle"
import ViewToggle, { type ViewMode } from "./ViewToggle"
import TagContextBars, { TagContextBarsSkeleton, TagContextBarsDegraded } from "./TagContextBars"
import FilterPill from "./FilterPill"
import BandcampImg from "./BandcampImg"

export type ScopeKind = "artist" | "host" | "genre"

const SCOPE_GLYPH: Record<ScopeKind, string> = {
  genre: "❖",
  host: "♜",
  artist: "♞",
}

type HostMeta = { id: string; name: string; image_id: string | null; url: string | null }
type FilterSpec = { id: string; kind: "include" | "exclude"; label: string; onClear: () => void }

// Shared modal for artist / host / genre scopes. Header adapts per kind; body
// lists the releases matching the scope intersected with page-level filters.
// Modal-internal ?genre= / ?xgenre= params narrow further without touching
// the page-level filter.
export default function ScopeModal({
  kind,
  value,
  onClose,
}: {
  kind: ScopeKind
  value: string
  onClose: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useModalSearchParams()
  const titleId = `scope-modal-${kind}-title`

  const pageTags = useMemo(() => searchParams.getAll("tag"), [searchParams])
  const pageXtags = useMemo(() => searchParams.getAll("xtag"), [searchParams])
  const innerGenres = useMemo(() => searchParams.getAll("genre"), [searchParams])
  const innerXgenres = useMemo(() => searchParams.getAll("xgenre"), [searchParams])

  // Build fetch URL from scope + all filters.
  const fetchUrl = useMemo(() => {
    const qs = new URLSearchParams()
    if (kind === "artist") qs.set("artist", value)
    if (kind === "host") qs.set("host_id", value)
    if (kind === "genre") qs.append("genre", value)
    for (const t of pageTags) qs.append("tag", t)
    for (const t of pageXtags) qs.append("xtag", t)
    for (const g of innerGenres) if (g !== value) qs.append("genre", g)
    for (const g of innerXgenres) qs.append("xgenre", g)
    return `/api/albums/by-scope?${qs.toString()}`
  }, [kind, value, pageTags, pageXtags, innerGenres, innerXgenres])

  // Seed host from the click-through cache so the header paints instantly.
  // Deep-link loads (no prior click) still need the server round-trip.
  const [host, setHost] = useState<HostMeta | null>(() =>
    kind === "host" ? getHostStub(value) : null,
  )
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState<ViewMode>("grid")
  const autoSwitchedRef = useRef(false)
  const [tagContextState, setTagContextState] = useState<{ key: string; data: TagContext } | null>(null)
  // Error tracked per contextKey so a failure on an earlier filter combo
  // does not bleed into the degraded UI when the user changes filters or
  // re-opens the section.
  const [tagContextError, setTagContextError] = useState<string | null>(null)
  const [tagContextRetry, setTagContextRetry] = useState(0)
  // Bars hidden by default so opening a genre modal stays fast — fetch
  // only fires once the user expands the related-tags section.
  const [tagContextOpen, setTagContextOpen] = useState(false)

  // Artist art comes from the click source. No fetch-time dependency.
  const seededArtistArt = kind === "artist" ? getArtistArt(value) : null

  // Host is preserved across filter changes; it only resets when the scope
  // kind/value itself changes (via key on ScopeModal).
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [error, setError] = useState(false)
  useResetOnChange([fetchUrl, reloadKey], () => { setAlbums(null); setError(false) })

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(fetchUrl, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ albums: AlbumListItem[]; host?: HostMeta | null }>
      })
      .then((d) => {
        setError(false)
        setAlbums(d.albums ?? [])
        if (d.host) setHost(d.host)
        // Auto-default to list view for large non-genre result sets,
        // one-shot per scope load (autoSwitchedRef resets on kind/value).
        if (!autoSwitchedRef.current && kind !== "genre" && (d.albums?.length ?? 0) > 20) {
          autoSwitchedRef.current = true
          setView("list")
        }
      })
      .catch((err) => { if ((err as Error).name !== "AbortError") setError(true) })
    return () => ctrl.abort()
  }, [fetchUrl, reloadKey, kind])

  // Tags fed to the related-tags bars. Primary scope + every active include
  // filter (page tags + chip genres), and every active exclude. Bars reflect
  // exactly the filtered album set the list is showing, so percentages match.
  const contextIncludeTags = useMemo(() => {
    if (kind !== "genre") return [] as string[]
    const uniq = new Set<string>([value, ...innerGenres, ...pageTags])
    return Array.from(uniq)
  }, [kind, value, innerGenres, pageTags])
  const contextExcludeTags = useMemo(() => {
    if (kind !== "genre") return [] as string[]
    return Array.from(new Set<string>([...pageXtags, ...innerXgenres]))
  }, [kind, pageXtags, innerXgenres])

  // Fetch related genre/theme bars. The returned state carries its key so
  // stale data from the previous scope doesn't render while the new fetch
  // is in flight.
  const contextKey = useMemo(
    () => `${contextIncludeTags.join("|")}!${contextExcludeTags.join("|")}`,
    [contextIncludeTags, contextExcludeTags],
  )
  useEffect(() => {
    if (kind !== "genre" || !tagContextOpen || contextIncludeTags.length === 0) return
    const ctrl = new AbortController()
    const parts = [
      ...contextIncludeTags.map((t) => `tag=${encodeURIComponent(t)}`),
      ...contextExcludeTags.map((t) => `xtag=${encodeURIComponent(t)}`),
    ]
    fetch(`/api/albums/tag-context?${parts.join("&")}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setTagContextState({ key: contextKey, data: d })
        else setTagContextError(contextKey)
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setTagContextError(contextKey)
      })
    return () => ctrl.abort()
  }, [kind, tagContextOpen, contextKey, contextIncludeTags, contextExcludeTags, tagContextRetry])
  const tagContext = tagContextState?.key === contextKey ? tagContextState.data : null

  // Reset the one-shot auto-switch when the scope value changes, so moving
  // between tags in a pinned genre modal can re-evaluate grid vs list.
  useEffect(() => { autoSwitchedRef.current = false }, [kind, value])

  // Genre scope counts come from the COUNT RPC behind tag-context; the album
  // list endpoint caps at 500 rows and would otherwise flash "500" before the
  // real total arrives. Show a placeholder subtitle until tag-context loads.
  const count = kind === "genre"
    ? tagContext?.total ?? null
    : albums?.length ?? null
  const coverArtId = seededArtistArt ?? albums?.[0]?.art_id ?? null
  const extraInnerGenres = innerGenres.filter((g) => !(kind === "genre" && g === value))
  // Single extra genre (no excludes) → pair view: render "A × B" in the header
  // rather than chip the partner as a filter. Three-way and beyond fall back
  // to the filter row.
  const pairPartner =
    kind === "genre" && extraInnerGenres.length === 1 && innerXgenres.length === 0
      ? extraInnerGenres[0]
      : null
  const chipGenres = pairPartner ? [] : extraInnerGenres

  const removeFilter = (name: "tag" | "xtag" | "genre" | "xgenre", val: string) => {
    const next = new URLSearchParams(window.location.search)
    if (name === "tag" || name === "xtag") {
      // Page-level params aren't modal kinds; remove the matching instance
      // directly. They drive the release list behind the modal so the nav
      // must go through Next.js for an RSC refresh.
      const remaining = next.getAll(name).filter((v) => v !== val)
      next.delete(name)
      for (const v of remaining) next.append(name, v)
      router.push(`${pathname}${toQueryString(next)}`)
    } else {
      pushModalUrl(`${pathname}${toQueryString(closeModal(next, name, val))}`)
    }
  }

  // Close the pair by navigating to a single-genre modal for the chosen side.
  // Drops inner genre/xgenre so bars and list re-scope to the new single tag.
  const navigateToSingleGenre = (name: string) => {
    let next = new URLSearchParams(window.location.search)
    next = closeModal(next, "genre")
    next = closeModal(next, "xgenre")
    next = openModal(next, "genre", name)
    pushModalUrl(`${pathname}${toQueryString(next)}`)
  }

  const filters: FilterSpec[] = [
    ...pageTags.map((t) => ({ id: `t-${t}`, kind: "include" as const, label: t, onClear: () => removeFilter("tag", t) })),
    ...pageXtags.map((t) => ({ id: `xt-${t}`, kind: "exclude" as const, label: t, onClear: () => removeFilter("xtag", t) })),
    ...chipGenres.map((t) => ({ id: `g-${t}`, kind: "include" as const, label: t, onClear: () => removeFilter("genre", t) })),
    ...innerXgenres.map((t) => ({ id: `xg-${t}`, kind: "exclude" as const, label: t, onClear: () => removeFilter("xgenre", t) })),
  ]

  return (
    <ModalShell titleId={titleId} fixedHeight={kind === "genre"} onClose={onClose}>
      <ScopeHeader
        kind={kind}
        value={kind === "host" && host ? host.name : value}
        loading={kind === "host" && !host}
        pairPartner={pairPartner}
        onNavigatePair={navigateToSingleGenre}
        coverArtId={coverArtId}
        hostImageId={host?.image_id ?? null}
        hostUrl={safeExternalHref(host?.url)}
        count={count}
        view={view}
        setView={setView}
        filters={filters}
        onBack={() => router.back()}
        onClose={onClose}
        titleId={titleId}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}>
        {kind === "genre" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                const next = !tagContextOpen
                setTagContextOpen(next)
                if (next) setTagContextError(null)
              }}
              aria-expanded={tagContextOpen}
              className="flex items-center gap-2 font-display text-[10px] tracking-[0.2em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer"
            >
              <span aria-hidden className="text-accent/60 w-3 inline-block">
                {tagContextOpen ? "▾" : "▸"}
              </span>
              <span>See related tags</span>
            </button>
            {tagContextOpen && (
              <div className="mt-3">
                {tagContext ? (
                  <TagContextBars
                    category={tagContext.category}
                    total={tagContext.total}
                    genres={tagContext.genres}
                    themes={tagContext.themes}
                    excludeTags={[...pageTags, ...pageXtags, ...chipGenres, ...innerXgenres]}
                  />
                ) : tagContextError === contextKey ? (
                  <TagContextBarsDegraded
                    onRetry={() => {
                      setTagContextError(null)
                      setTagContextRetry((k) => k + 1)
                    }}
                  />
                ) : (
                  <TagContextBarsSkeleton />
                )}
              </div>
            )}
          </div>
        )}
        {error ? (
          <FetchError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !albums ? (
          view === "grid" ? <GridSkeleton count={kind === "genre" ? 5 : 10} reserveLoadMore={kind === "genre"} /> : <ListSkeleton count={10} />
        ) : albums.length === 0 ? (
          <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
            No releases found
          </div>
        ) : view === "grid" ? (
          <RecentGrid
            albums={albums}
            showDate
            hideHost={kind === "host"}
            pageSize={kind === "genre" ? 5 : undefined}
          />
        ) : (
          <AlbumGrid albums={albums} showDate hideHost={kind === "host"} />
        )}
      </div>
    </ModalShell>
  )
}

function ScopeHeader({
  kind,
  value,
  loading = false,
  pairPartner,
  onNavigatePair,
  coverArtId,
  hostImageId,
  hostUrl,
  count,
  view,
  setView,
  filters,
  onBack,
  onClose,
  titleId,
}: {
  kind: ScopeKind
  value: string
  loading?: boolean
  pairPartner?: string | null
  onNavigatePair?: (name: string) => void
  coverArtId: string | null
  hostImageId?: string | null
  hostUrl?: string | null
  count: number | null
  view: ViewMode
  setView: (v: ViewMode) => void
  filters: FilterSpec[]
  onBack: () => void
  onClose: () => void
  titleId: string
}) {
  const imgSrc =
    kind === "host" ? hostImageUrl(hostImageId ?? null) :
    kind === "artist" && coverArtId ? coverUrl(coverArtId, "thumb") :
    null

  const leading = imgSrc ? (
    <BandcampImg
      src={imgSrc}
      alt=""
      decoding="async"
      className="w-10 h-10 object-cover border border-border shrink-0"
    />
  ) : (
    <div className="w-10 h-10 flex items-center justify-center border border-border bg-bg-card shrink-0">
      <span aria-hidden="true" className="text-xl text-border select-none">
        {SCOPE_GLYPH[kind]}
      </span>
    </div>
  )

  const titleNode = loading ? (
    <span className="inline-flex items-center">
      <span className="sr-only">Loading host</span>
      <span aria-hidden className="inline-block h-4 w-32 max-w-full bg-bg-card rounded-sm animate-pulse" />
    </span>
  ) : pairPartner && onNavigatePair ? (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNavigatePair(value) }}
        className="hover:text-accent transition-colors cursor-pointer underline-offset-2 decoration-accent/40 hover:underline"
      >
        {value}
      </button>
      <span aria-hidden className="text-text-dim mx-1">×</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNavigatePair(pairPartner) }}
        className="hover:text-accent transition-colors cursor-pointer underline-offset-2 decoration-accent/40 hover:underline"
      >
        {pairPartner}
      </button>
    </>
  ) : (
    value
  )

  return (
    <ModalHeader
      titleId={titleId}
      leading={leading}
      title={titleNode}
      subtitle={
        <ModalCountSubtitle
          count={count}
          suffix={pairPartner ? "releases sharing both" : undefined}
          loadingLabel={`${kind} releases`}
        />
      }
      chips={
        filters.length > 0
          ? filters.map((f) => (
              <FilterPill key={f.id} kind={f.kind} label={f.label} onClear={f.onClear} />
            ))
          : undefined
      }
      actions={
        <>
          {kind === "host" && hostUrl && (
            <a
              href={hostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-xs tracking-[0.1em] text-accent hover:text-accent-hover transition-colors"
            >
              Bandcamp →
            </a>
          )}
          <ModalIconButton onClick={onBack} label="Back" title="Back">
            ←
          </ModalIconButton>
          <ViewToggle view={view} setView={setView} />
          <ModalCloseButton onClick={onClose} />
        </>
      }
    />
  )
}

