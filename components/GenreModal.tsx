"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlbumListItem } from "@/lib/types"
import { useModal } from "@/lib/useModal"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { ViewToggle, type ViewMode } from "./ReleasesModal"
import type { GenrePair } from "./GenreMap"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"

// ---------------------------------------------------------------------------
// Navigation stack

type Page =
  | { kind: "single"; genre: string; count: number; pairs: GenrePair[] }
  | { kind: "pair"; a: string; b: string; count: number }

export default function GenreModal({
  tags,
  expectedCount,
  pairs,
  allActivePairs,
  nodeCounts,
  onClose,
}: {
  tags: string[]
  expectedCount: number
  pairs?: GenrePair[]
  allActivePairs?: GenrePair[]
  nodeCounts?: Map<string, number>
  onClose: () => void
}) {
  const [pages, setPages] = useState<Page[]>(() => {
    if (tags.length === 1 && pairs !== undefined) {
      return [{ kind: "single", genre: tags[0], count: expectedCount, pairs }]
    }
    return [{ kind: "pair", a: tags[0], b: tags[1], count: expectedCount }]
  })

  const currentPage = pages[pages.length - 1]
  const canGoBack = pages.length > 1

  const goBack = () => setPages((prev) => prev.slice(0, -1))

  const navigateToSingle = (name: string) => {
    if (!allActivePairs || !nodeCounts) return
    const count = nodeCounts.get(name) ?? 0
    const tagPairs = allActivePairs
      .filter((p) => p.a === name || p.b === name)
      .sort((a, b) => b.n - a.n)
    setPages((prev) => [...prev, { kind: "single", genre: name, count, pairs: tagPairs }])
  }

  const navigateToPair = (a: string, b: string, count: number) => {
    setPages((prev) => [...prev, { kind: "pair", a, b, count }])
  }

  return (
    <ModalShell titleId="genre-modal-title" onClose={onClose}>
      {currentPage.kind === "single" ? (
        <SingleGenreView
          key={currentPage.genre}
          genre={currentPage.genre}
          totalCount={currentPage.count}
          pairs={currentPage.pairs}
          onBack={canGoBack ? goBack : undefined}
          onClose={onClose}
          onGenreClick={navigateToSingle}
          onPairClick={navigateToPair}
        />
      ) : (
        <PairView
          key={`${currentPage.a}|${currentPage.b}`}
          a={currentPage.a}
          b={currentPage.b}
          expectedCount={currentPage.count}
          onBack={canGoBack ? goBack : undefined}
          onClose={onClose}
          onTagClick={allActivePairs && nodeCounts ? navigateToSingle : undefined}
        />
      )}
    </ModalShell>
  )
}

function singleFetchUrl(genre: string): string {
  const p = new URLSearchParams()
  p.append("tag", genre)
  p.set("limit", "500")
  return `/api/albums/by-tags?${p.toString()}`
}

// ---------------------------------------------------------------------------
// Shared header — identical markup in every view keeps the back button stable

function ModalHeader({
  title,
  subtitle,
  onBack,
  onClose,
  action,
}: {
  title: React.ReactNode
  subtitle: string
  onBack?: () => void
  onClose: () => void
  action?: React.ReactNode
}) {
  const btnClass = "w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer shrink-0 text-base leading-none"
  return (
    <div className="pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h2
          id="genre-modal-title"
          className="font-display text-lg text-text-bright font-bold tracking-wide truncate"
        >
          {title}
        </h2>
        <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim mt-0.5">
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onBack}
          disabled={!onBack}
          aria-label="Back"
          className={`${btnClass} font-display text-sm ${!onBack ? "invisible" : ""}`}
        >
          ←
        </button>
        {action}
        <button onClick={onClose} aria-label="Close" className={`${btnClass} text-lg`}>
          ×
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared shell — rendered once per trigger, never re-mounts on navigation

function ModalShell({
  titleId,
  onClose,
  children,
}: {
  titleId: string
  onClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal(onClose, dialogRef)

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center animate-backdrop-in backdrop-blur-xs"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-bg max-w-4xl w-full mx-4 h-[85vh] flex flex-col animate-modal-in border border-border outline-none"
        style={{
          boxShadow:
            "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Data fetching

function useAlbums(fetchUrl: string) {
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setAlbums(null)
    setError(false)
    fetch(fetchUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setAlbums(data.albums ?? [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [fetchUrl, reloadKey])

  return { albums, error, retry: () => setReloadKey((k) => k + 1) }
}

// ---------------------------------------------------------------------------
// Connections bar chart — matches HostRow style from stats page

function ConnectionsChart({
  genre,
  pairs,
  onGenreClick,
}: {
  genre: string
  pairs: GenrePair[]
  onGenreClick: (name: string, count: number) => void
}) {
  const items = pairs.map((p) => ({ name: p.a === genre ? p.b : p.a, count: p.n }))

  if (items.length === 0) return null

  const max = items[0].count

  return (
    <div
      className="relative"
      style={{
        maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
      }}
    >
      <ol
        className="flex flex-col gap-0.5 overflow-y-auto"
        style={{
          maxHeight: "calc(8 * 1.75rem + 7 * 0.125rem)",
          scrollbarWidth: "none",
        }}
      >
        {items.map((item) => {
          const widthPct = (item.count / max) * 100
          return (
            <li
              key={item.name}
              onClick={() => onGenreClick(item.name, item.count)}
              style={
                {
                  "--bar-bg": `color-mix(in srgb, var(--color-plot-bar-max) ${widthPct}%, var(--color-plot-bar-min))`,
                } as React.CSSProperties
              }
              className="relative h-7 flex items-center shrink-0 cursor-pointer group hover:[--bar-bg:var(--color-plot-bar-hover)]"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-colors"
                style={{ width: `${widthPct}%`, opacity: 0.7, background: "var(--bar-bg)" }}
              />
              <span className="relative font-sans text-sm text-text group-hover:text-text-bright pl-2 truncate min-w-0 flex-1 transition-colors">
                {item.name}
              </span>
              <span className="relative font-display text-xs tracking-[0.1em] text-text-bright tabular-nums pl-3 pr-2 shrink-0">
                {item.count}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single-genre view (node click): overview → full list

function SingleGenreView({
  genre,
  totalCount,
  pairs,
  onBack,
  onClose,
  onGenreClick,
  onPairClick,
}: {
  genre: string
  totalCount: number
  pairs: GenrePair[]
  onBack?: () => void
  onClose: () => void
  onGenreClick: (name: string) => void
  onPairClick: (a: string, b: string, count: number) => void
}) {
  const [mode, setMode] = useState<"overview" | "full">("overview")
  const [view, setView] = useState<ViewMode>(totalCount > 20 ? "list" : "grid")
  const { albums, error, retry } = useAlbums(singleFetchUrl(genre))
  // When totalCount is 0 (opened without genre map context), resolve from loaded albums.
  const displayCount = albums !== null ? albums.length : totalCount > 0 ? totalCount : null

  return (
    <>
      {mode === "overview" ? (
        <>
          <ModalHeader title={genre} subtitle={displayCount !== null ? `${displayCount} releases` : "releases"} onBack={onBack} onClose={onClose} />

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {pairs.length > 0 && (
              <div className="px-6 pt-5 pb-4">
                <div className="font-display text-[10px] tracking-[0.2em] uppercase text-accent/80 mb-3">
                  Related Genres
                </div>
                <ConnectionsChart
                  genre={genre}
                  pairs={pairs}
                  onGenreClick={(name, count) => onPairClick(genre, name, count)}
                />
              </div>
            )}

            {pairs.length > 0 && <div className="modal-rule" />}

            <div className="px-6 pt-5 pb-6">
              <div className="font-display text-[10px] tracking-[0.2em] uppercase text-accent/80 mb-3">
                Recent Releases
              </div>

              {error ? (
                <FetchError onRetry={retry} />
              ) : !albums ? (
                <GridSkeleton count={5} />
              ) : albums.length === 0 ? (
                <p className="text-text-dim text-xs font-display py-2">No releases found.</p>
              ) : (
                <RecentGrid albums={albums.slice(0, 5)} showDate />
              )}

              {!error && (albums === null || albums.length > 0) && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setMode("full")}
                    className="font-display text-[10px] tracking-[0.25em] uppercase text-accent hover:text-accent-hover transition-colors cursor-pointer border border-accent/40 hover:border-accent/70 px-5 py-2"
                  >
                    See all {displayCount ?? "…"} releases →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <ModalHeader
            title={genre}
            subtitle={displayCount !== null ? `${displayCount} releases tagged` : "releases tagged"}
            onBack={() => setMode("overview")}
            onClose={onClose}
            action={<ViewToggle view={view} setView={setView} />}
          />

          <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin" }}>
            {error ? (
              <FetchError onRetry={retry} />
            ) : !albums ? (
              view === "grid" ? (
                <GridSkeleton count={totalCount} />
              ) : (
                <ListSkeleton count={totalCount} />
              )
            ) : albums.length === 0 ? (
              <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
                No releases found
              </div>
            ) : view === "grid" ? (
              <RecentGrid albums={albums} showDate />
            ) : (
              <AlbumGrid albums={albums} showDate />
            )}
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pair view (edge click or bar item click): full list immediately

function PairView({
  a,
  b,
  expectedCount,
  onBack,
  onClose,
  onTagClick,
}: {
  a: string
  b: string
  expectedCount: number
  onBack?: () => void
  onClose: () => void
  onTagClick?: (tag: string) => void
}) {
  const fetchUrl = (() => {
    const p = new URLSearchParams()
    p.append("tag", a)
    p.append("tag", b)
    p.set("limit", "500")
    return `/api/albums/by-tags?${p.toString()}`
  })()
  const [view, setView] = useState<ViewMode>(expectedCount > 20 ? "list" : "grid")
  const { albums, error, retry } = useAlbums(fetchUrl)

  return (
    <>
      <ModalHeader
        title={
          onTagClick ? (
            <>
              <button
                type="button"
                onClick={() => onTagClick(a)}
                className="hover:text-accent transition-colors cursor-pointer underline-offset-2 decoration-accent/40 hover:underline"
              >
                {a}
              </button>
              {" "}<span className="text-text-dim">×</span>{" "}
              <button
                type="button"
                onClick={() => onTagClick(b)}
                className="hover:text-accent transition-colors cursor-pointer underline-offset-2 decoration-accent/40 hover:underline"
              >
                {b}
              </button>
            </>
          ) : (
            <>{a} <span className="text-text-dim">×</span> {b}</>
          )
        }
        subtitle={`${expectedCount} releases sharing both tags`}
        onBack={onBack}
        onClose={onClose}
        action={<ViewToggle view={view} setView={setView} />}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin" }}>
        {error ? (
          <FetchError onRetry={retry} />
        ) : !albums ? (
          view === "grid" ? (
            <GridSkeleton count={expectedCount} />
          ) : (
            <ListSkeleton count={expectedCount} />
          )
        ) : albums.length === 0 ? (
          <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
            No releases found
          </div>
        ) : view === "grid" ? (
          <RecentGrid albums={albums} showDate />
        ) : (
          <AlbumGrid albums={albums} showDate />
        )}
      </div>
    </>
  )
}

