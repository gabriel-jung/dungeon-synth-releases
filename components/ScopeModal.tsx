"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlbumListItem, coverUrl, hostImageUrl, releaseCount } from "@/lib/types"
import { closeModal, toQueryString } from "@/lib/modalUrl"
import { getHostStub, getArtistArt } from "@/lib/albumCache"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ViewToggle, { type ViewMode } from "./ViewToggle"

export type ScopeKind = "artist" | "host" | "genre"

type HostMeta = { id: string; name: string; image_id: string | null; url: string | null }

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
  const searchParams = useSearchParams()
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

  // Default to list view when the result set is large. Fires once per albums
  // load so a user manually switching back to grid isn't immediately overridden.
  useEffect(() => {
    if (!albums || autoSwitchedRef.current) return
    autoSwitchedRef.current = true
    if (albums.length > 20) setView("list")
  }, [albums])

  const count = albums?.length ?? null
  const coverArtId = seededArtistArt ?? albums?.[0]?.art_id ?? null
  const totalFilters = pageTags.length + pageXtags.length + innerGenres.length + innerXgenres.length

  const removeFilter = (name: "tag" | "xtag" | "genre" | "xgenre", val: string) => {
    const next = closeModal(
      new URLSearchParams(searchParams.toString()),
      name as never,
      val,
    )
    router.push(`${pathname}${toQueryString(next)}`)
  }

  return (
    <ModalShell titleId={titleId} onClose={onClose}>
      <ScopeHeader
        kind={kind}
        value={kind === "host" && host ? host.name : value}
        coverArtId={coverArtId}
        hostImageId={host?.image_id ?? null}
        hostUrl={host?.url ?? null}
        count={count}
        view={view}
        setView={setView}
        onClose={onClose}
        titleId={titleId}
      />

      {totalFilters > 0 && (
        <div className="shrink-0 px-6 py-2 border-b border-border/60 flex items-center gap-1.5 flex-wrap">
          <span className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim mr-1">
            Filtered
          </span>
          {pageTags.map((t) => (
            <FilterPill key={`t-${t}`} kind="include" label={t} onClear={() => removeFilter("tag", t)} />
          ))}
          {pageXtags.map((t) => (
            <FilterPill key={`xt-${t}`} kind="exclude" label={t} onClear={() => removeFilter("xtag", t)} />
          ))}
          {innerGenres.filter((g) => !(kind === "genre" && g === value)).map((t) => (
            <FilterPill key={`g-${t}`} kind="include" label={t} onClear={() => removeFilter("genre", t)} />
          ))}
          {innerXgenres.map((t) => (
            <FilterPill key={`xg-${t}`} kind="exclude" label={t} onClear={() => removeFilter("xgenre", t)} />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin" }}>
        {error ? (
          <FetchError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !albums ? (
          view === "grid" ? <GridSkeleton count={10} /> : <ListSkeleton count={10} />
        ) : albums.length === 0 ? (
          <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
            No releases found
          </div>
        ) : view === "grid" ? (
          <RecentGrid albums={albums} showDate hideHost={kind === "host"} />
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
  coverArtId,
  hostImageId,
  hostUrl,
  count,
  view,
  setView,
  onClose,
  titleId,
}: {
  kind: ScopeKind
  value: string
  coverArtId: string | null
  hostImageId?: string | null
  hostUrl?: string | null
  count: number | null
  view: ViewMode
  setView: (v: ViewMode) => void
  onClose: () => void
  titleId: string
}) {
  const imgSrc =
    kind === "host" ? hostImageUrl(hostImageId ?? null) :
    kind === "artist" && coverArtId ? coverUrl(coverArtId, "thumb") :
    null

  const subtitle =
    count === null ? `${kind} releases` :
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
            {value}
          </h2>
          <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">
            {subtitle}
          </p>
        </div>
      </div>
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
        <ViewToggle view={view} setView={setView} />
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer text-base leading-none"
        >
          <span className="hidden sm:inline">×</span>
          <span className="sm:hidden">←</span>
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
