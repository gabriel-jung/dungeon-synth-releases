"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AlbumListItem, coverUrl, hostImageUrl, releaseCount, safeExternalHref } from "@/lib/types"
import { closeModal, openModal, pushModalUrl, toQueryString } from "@/lib/modalUrl"
import { useModalSearchParams } from "@/lib/useModalUrl"
import type { TagContext } from "@/lib/tagContext"
import { getHostStub, getArtistArt } from "@/lib/albumCache"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ViewToggle, { type ViewMode } from "./ViewToggle"
import TagContextBars, { TagContextBarsSkeleton } from "./TagContextBars"

export type ScopeKind = "artist" | "host" | "genre"

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

  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  // Seed host from the click-through cache so the header paints instantly.
  // Deep-link loads (no prior click) still need the server round-trip.
  const [host, setHost] = useState<HostMeta | null>(() =>
    kind === "host" ? getHostStub(value) : null,
  )
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState<ViewMode>("grid")
  const autoSwitchedRef = useRef(false)
  const [tagContextState, setTagContextState] = useState<{ key: string; data: TagContext } | null>(null)

  // Artist art comes from the click source. No fetch-time dependency.
  const seededArtistArt = kind === "artist" ? getArtistArt(value) : null

  useEffect(() => {
    const ctrl = new AbortController()
    setAlbums(null)
    setError(false)
    // Preserve the seeded host stub across filter changes; only reset when
    // the scope kind/value itself changes (handled via key on ScopeModal).
    fetch(fetchUrl, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ albums: AlbumListItem[]; host?: HostMeta | null }>
      })
      .then((d) => {
        setAlbums(d.albums ?? [])
        if (d.host) setHost(d.host)
      })
      .catch((err) => { if ((err as Error).name !== "AbortError") setError(true) })
    return () => ctrl.abort()
  }, [fetchUrl, reloadKey])

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
    if (kind !== "genre" || contextIncludeTags.length === 0) return
    const ctrl = new AbortController()
    const parts = [
      ...contextIncludeTags.map((t) => `tag=${encodeURIComponent(t)}`),
      ...contextExcludeTags.map((t) => `xtag=${encodeURIComponent(t)}`),
    ]
    fetch(`/api/albums/tag-context?${parts.join("&")}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setTagContextState({ key: contextKey, data: d }) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [kind, contextKey, contextIncludeTags, contextExcludeTags])
  const tagContext = tagContextState?.key === contextKey ? tagContextState.data : null

  // Reset the one-shot auto-switch when the scope value changes, so moving
  // between tags in a pinned genre modal can re-evaluate grid vs list.
  useEffect(() => { autoSwitchedRef.current = false }, [kind, value])

  // Default to list view when the result set is large. Genre scope keeps the
  // paged cover grid (5 at a time) regardless of size so the bar plots + first
  // few releases fit in one view. Fires once per albums load so a user manually
  // switching back to grid isn't immediately overridden.
  useEffect(() => {
    if (!albums || autoSwitchedRef.current) return
    autoSwitchedRef.current = true
    if (kind !== "genre" && albums.length > 20) setView("list")
  }, [albums, kind])

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

      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "auto", scrollbarGutter: "stable" }}>
        {kind === "genre" && (tagContext ? (
          <TagContextBars
            category={tagContext.category}
            total={tagContext.total}
            genres={tagContext.genres}
            themes={tagContext.themes}
            excludeTags={[...pageTags, ...pageXtags, ...chipGenres, ...innerXgenres]}
          />
        ) : (
          <TagContextBarsSkeleton />
        ))}
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

  const subtitle =
    count === null ? `${kind} releases` :
    pairPartner ? `${count.toLocaleString()} releases sharing both` :
    `${releaseCount(count)}`

  return (
    <div className="pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            decoding="async"
            className="w-10 h-10 object-cover border border-border shrink-0"
          />
        ) : (
          <div className="w-10 h-10 flex items-center justify-center border border-border bg-bg-card shrink-0">
            <span aria-hidden="true" className="text-xl text-border select-none">
              {kind === "genre" ? "❖" : kind === "host" ? "♜" : "♞"}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg text-text-bright font-bold truncate">
            {pairPartner && onNavigatePair ? (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onNavigatePair(value) }}
                  className="hover:text-accent transition-colors cursor-pointer underline-offset-2 decoration-accent/40 hover:underline"
                >
                  {value}
                </button>
                <span className="text-text-dim"> × </span>
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
            )}
          </h2>
          <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">
            {subtitle}
          </p>
        </div>
      </div>
      {filters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink min-w-0">
          {filters.map((f) => (
            <FilterPill key={f.id} kind={f.kind} label={f.label} onClear={f.onClear} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 shrink-0">
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
        <button
          onClick={onBack}
          aria-label="Back"
          title="Back"
          className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer text-base leading-none"
        >
          ←
        </button>
        <ViewToggle view={view} setView={setView} />
        <button
          onClick={onClose}
          aria-label="Close"
          className="hidden sm:flex w-7 h-7 items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function FilterPill({
  kind,
  label,
  onClear,
}: {
  kind: "include" | "exclude"
  label: string
  onClear: () => void
}) {
  const isInclude = kind === "include"
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] tracking-wide px-1.5 py-0.5 ${
        isInclude
          ? "bg-tag-include/15 text-tag-include border-b border-tag-include/70"
          : "bg-tag-exclude/15 text-tag-exclude border-b border-tag-exclude/70"
      }`}
    >
      <span aria-hidden className="text-[9px] opacity-80">
        {isInclude ? "✦" : "⊘"}
      </span>
      <span className={isInclude ? "" : "line-through"}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="ml-0.5 text-sm leading-none text-current opacity-70 hover:opacity-100 cursor-pointer"
      >
        ×
      </button>
    </span>
  )
}
