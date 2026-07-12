"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Album, AlbumListItem, coverUrl, formatDateShort, safeExternalHref } from "@/lib/types"
import { useModal } from "@/lib/useModal"
import { useAlbumCardModals } from "@/lib/useAlbumCardModals"
import { SITE_URL } from "@/lib/site"
import { addToList, isInList, type AddToListResult } from "@/lib/listDraft"
import { encodeCardState } from "@/lib/listCodec"
import { useShareLink } from "@/lib/useShareLink"
import { useClickOutside } from "@/lib/useClickOutside"
import BandcampImg from "./BandcampImg"

export function AlbumGrid({
  albums,
  hideHost = false,
  showDate = false,
}: {
  albums: AlbumListItem[]
  hideHost?: boolean
  showDate?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
      {albums.map((album) => (
        <ReleaseCard key={album.id} album={album} hideHost={hideHost} showDate={showDate} />
      ))}
    </div>
  )
}

function ReleaseCard({
  album,
  hideHost = false,
  showDate = false,
}: {
  album: AlbumListItem
  hideHost?: boolean
  showDate?: boolean
}) {
  const { showHostInline, onArtistClick, openHost, push } = useAlbumCardModals(album, { hideHost })
  const openAlbum = (e?: React.SyntheticEvent) => { e?.stopPropagation(); push("album", album.id) }

  // Stretched-button pattern: the album-open control is a full-card overlay
  // button BEHIND the text (siblings, not a parent), so the artist/host
  // controls aren't nested inside another interactive element. The text layer
  // is pointer-events-none so empty-area clicks fall through to the overlay;
  // the interactive children re-enable pointer events above it.
  return (
    <article className="relative py-2.5 pl-2 border-l-2 border-transparent hover:bg-bg-hover hover:border-accent transition-colors group">
      <button
        type="button"
        onClick={openAlbum}
        aria-label={`Open ${album.artist} — ${album.title}`}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onArtistClick() }}
        className="relative z-10 text-[0.95rem] text-accent hover:text-accent-hover hover:underline decoration-dotted underline-offset-2 transition-colors text-left cursor-pointer"
      >
        {album.artist}
      </button>
      <div className="relative z-10 pointer-events-none">
        <span className="text-text-bright italic text-sm">{album.title}</span>
        {showHostInline && (
          <>
            <span className="text-text-dim"> · </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openHost() }}
              className="pointer-events-auto text-text-dim hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors text-xs tracking-wide uppercase cursor-pointer"
            >
              {album.host_name}
            </button>
          </>
        )}
        {showDate && album.date && (
          <>
            <span className="text-text-dim"> · </span>
            <span className="text-text-dim text-xs tracking-wide tabular-nums">
              {formatDateShort(album.date, true)}
            </span>
          </>
        )}
      </div>
    </article>
  )
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function AlbumDetail({
  albumStub,
  initialAlbum = null,
  onClose,
}: {
  albumStub: AlbumListItem
  initialAlbum?: Album | null
  onClose: () => void
}) {
  const [album, setAlbum] = useState<Album | null>(initialAlbum)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const { copied: linkCopied, share } = useShareLink()
  const shareRef = useRef<HTMLDivElement>(null)
  const shareBtnRef = useRef<HTMLButtonElement>(null)
  const [listResult, setListResult] = useState<AddToListResult | null>(null)
  const [inList, setInList] = useState(false)
  const listTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show "In list ✓" up front when the album is already in the working list
  // or the add queue, so it isn't re-added by reflex. isInList asks the page
  // via a DOM event (and reads localStorage), so it can't run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListResult(null)
    setInList(isInList(albumStub.id))
  }, [albumStub.id])
  // Story-card image query for this album, encoded up front so the Card
  // entry is ready by the time the menu opens.
  const [cardQ, setCardQ] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    void encodeCardState(albumStub.id).then((d) => {
      if (on) setCardQ(d)
    })
    return () => {
      on = false
    }
  }, [albumStub.id])

  // Warm the card PNG on hover/focus of the Card entry itself: the cold
  // Satori render takes seconds, so the download starts instantly when
  // tapped, without spending a render (and rate-limit budget) for everyone
  // who opens Share just to copy the link.
  const warmedRef = useRef<string | null>(null)
  const warmCard = () => {
    if (!cardQ || warmedRef.current === cardQ) return
    warmedRef.current = cardQ
    void fetch(`/api/list/image?d=${cardQ}`)
  }

  const hasInitialRef = useRef(initialAlbum?.id === albumStub.id)
  const { onArtistClick, openHost, push } = useAlbumCardModals(albumStub)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = `album-modal-title-${albumStub.id}`

  useModal(onClose, dialogRef)

  useEffect(() => {
    return () => {
      if (listTimerRef.current) clearTimeout(listTimerRef.current)
    }
  }, [])

  // Close the share menu on any press outside it.
  useClickOutside(shareRef, shareOpen, () => setShareOpen(false))

  // Escape closes just the menu (not the whole modal) and hands focus back to
  // the trigger, so keyboard users aren't stranded on a removed node. Capture
  // phase so it wins over useModal's window-level Escape handler.
  const closeShare = () => {
    setShareOpen(false)
    shareBtnRef.current?.focus()
  }
  useEffect(() => {
    if (!shareOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      closeShare()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
    // closeShare only touches refs + a state setter; the mount-time copy is fine.
     
  }, [shareOpen])

  // Feeds the /list builder: a mounted builder picks the album up directly,
  // anywhere else it joins the add queue for the next /list visit.
  async function handleAddToList() {
    if (inList) return
    const r = await addToList(albumStub)
    setListResult(r)
    if (r === "added" || r === "exists") setInList(true)
    if (listTimerRef.current) clearTimeout(listTimerRef.current)
    listTimerRef.current = setTimeout(() => setListResult(null), 1800)
  }

  useEffect(() => {
    // Caller already handed us the full album — skip the initial fetch.
    // Subsequent retries (reloadKey > 0) always refetch.
    if (hasInitialRef.current && reloadKey === 0) {
      hasInitialRef.current = false
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/album?id=${encodeURIComponent(albumStub.id)}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { setError(false); setAlbum(data) })
      .catch((err) => { if ((err as Error).name !== "AbortError") setError(true) })
    return () => ctrl.abort()
  }, [albumStub.id, reloadKey])

  async function shareLink() {
    closeShare()
    await share(`${SITE_URL}/?album=${albumStub.id}`, `${albumStub.artist} - ${albumStub.title}`)
  }

  // Prefer stub for fields the card already has so the modal paints without
  // waiting for the server round-trip. Album-only fields (tags, num_tracks,
  // duration) stream in when the fetch resolves.
  const artId = album?.art_id ?? albumStub.art_id ?? null
  const img = coverUrl(artId)
  const hostName = album?.host_name ?? albumStub.host_name ?? null
  const bandcampUrl = safeExternalHref(album?.url ?? albumStub.url)
  const releaseDate = album?.date ?? albumStub.date
  const showHost = hostName && hostName.toLowerCase() !== albumStub.artist.toLowerCase()

  const portal = createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center backdrop-blur-xs bg-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-bg-card max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto sm:overflow-visible animate-modal-in flex flex-col sm:flex-row border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover — left side on desktop, top on mobile. Square box reserves
            layout so the (variable-ratio) art can't shift content when it
            loads; object-contain shows the full cover without cropping,
            non-square art letterboxes against the card bg. */}
        <div className="sm:w-72 shrink-0 bg-bg-card flex items-center justify-center">
          {img ? (
            <div className="w-full aspect-square flex items-center justify-center overflow-hidden">
              <BandcampImg
                src={img}
                alt={`${albumStub.artist} — ${albumStub.title}`}
                decoding="async"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="py-16 sm:py-0 sm:w-full sm:aspect-square flex items-center justify-center">
              <span aria-hidden="true" className="text-5xl text-border select-none">♜</span>
            </div>
          )}
        </div>

        {/* Info — right side on desktop, below on mobile */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-3 sm:border-l border-t sm:border-t-0 border-border sm:max-h-72 sm:overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div>
            <h2 id={titleId} className="text-xl text-text-bright font-bold leading-tight">
              {albumStub.title}
            </h2>
            <button
              onClick={onArtistClick}
              className="text-base text-accent hover:text-accent-hover hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left mt-0.5"
            >
              {albumStub.artist}
            </button>
          </div>

          {error ? (
            <div className="py-8 flex flex-col items-center gap-2 text-text-dim font-display text-xs tracking-wide">
              <span>Failed to load album</span>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-accent hover:text-accent-hover transition-colors cursor-pointer uppercase tracking-[0.2em] text-[10px]"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="modal-rule" />
              <div className="flex items-center gap-2 text-xs text-text-dim font-display tracking-wide">
                {releaseDate && <span>{formatDateShort(releaseDate, true)}</span>}
                {album && album.num_tracks > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span>
                      {album.num_tracks} tracks{album.duration_sec > 0 && ` · ${formatDuration(album.duration_sec)}`}
                    </span>
                  </>
                )}
              </div>

              {album && album.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {album.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => push("genre", tag)}
                      className="text-[10px] tracking-wide uppercase px-2 py-0.5 text-text-dim border-b border-border/60 hover:text-accent hover:border-accent/60 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <div className="modal-rule mt-auto" />
              <div className="flex items-center justify-between gap-4">
                {showHost && (
                  <button
                    onClick={openHost}
                    className="text-text-dim text-xs hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left italic"
                  >
                    on {hostName}
                  </button>
                )}
                <div className="flex items-center gap-4 ml-auto">
                  <button
                    type="button"
                    onClick={handleAddToList}
                    className={`font-display text-xs tracking-[0.1em] transition-colors ${
                      inList ? "text-accent/70 cursor-default" : "text-text-dim hover:text-accent cursor-pointer"
                    }`}
                  >
                    {listResult === "added"
                      ? "Added ✓"
                      : listResult === "full"
                        ? "List full"
                        : inList
                          ? "In list ✓"
                          : "+ List"}
                  </button>
                  <div ref={shareRef} className="relative">
                    <button
                      ref={shareBtnRef}
                      type="button"
                      onClick={() => setShareOpen((v) => !v)}
                      aria-expanded={shareOpen}
                      aria-haspopup="menu"
                      className="font-display text-xs tracking-[0.1em] text-text-dim hover:text-accent transition-colors cursor-pointer"
                    >
                      {linkCopied ? "Link copied ✓" : "Share"}
                    </button>
                    {shareOpen && (
                      <div
                        role="menu"
                        className="absolute bottom-full right-0 mb-2 z-20 flex flex-col bg-bg-card border border-border min-w-28"
                        style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={shareLink}
                          title="Share or copy the link to this release"
                          className="px-3 py-2 text-left font-display text-xs tracking-[0.1em] text-text-dim hover:text-accent hover:bg-bg-hover transition-colors cursor-pointer"
                        >
                          Link
                        </button>
                        {cardQ && (
                          <a
                            role="menuitem"
                            href={`/api/list/image?d=${cardQ}`}
                            download
                            onMouseEnter={warmCard}
                            onFocus={warmCard}
                            onClick={closeShare}
                            title="Download the story-card image, then share it from your files or gallery"
                            className="px-3 py-2 text-left font-display text-xs tracking-[0.1em] text-text-dim hover:text-accent hover:bg-bg-hover transition-colors cursor-pointer border-t border-border/60"
                          >
                            Card ↓
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {bandcampUrl && (
                    <a
                      href={bandcampUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display text-xs tracking-[0.1em] text-accent hover:text-accent-hover transition-colors"
                    >
                      Bandcamp →
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="tap-target absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright bg-bg-card/80 border border-border transition-colors cursor-pointer text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )

  return portal
}
