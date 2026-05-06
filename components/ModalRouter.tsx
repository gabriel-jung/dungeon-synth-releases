"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { AlbumListItem, rpcRowToAlbumListItem } from "@/lib/types"
import { ALL_MODAL_KINDS, pushModalUrl, readModalState, toQueryString } from "@/lib/modalUrl"
import { useModalSearchParams } from "@/lib/useModalUrl"
import { getAlbumStub } from "@/lib/albumCache"
import AlbumDetail from "./AlbumDetail"
import DeepAlbumSkeleton from "./DeepAlbumSkeleton"
import ScopeModal, { type ScopeKind } from "./ScopeModal"
import DayModal from "./DayModal"
import UpcomingModal from "./UpcomingModal"

// Single source of truth for which modals are open. Reads URL params and
// renders the corresponding modals in a stable order so the focus-trap stack
// in `lib/useModal` always pops in the right sequence.
export default function ModalRouter() {
  const searchParams = useModalSearchParams()
  const pathname = usePathname()

  const state = readModalState(searchParams)

  // × always exits modal mode entirely: clears every modal param in one go.
  // Back-stepping between modal states is reserved for the browser back button
  // (and each modal's header back arrow, which calls `router.back`).
  const closeAll = useCallback(() => {
    const current = new URLSearchParams(window.location.search)
    for (const kind of ALL_MODAL_KINDS) current.delete(kind)
    pushModalUrl(`${pathname}${toQueryString(current)}`)
  }, [pathname])

  // Determine scope modal kind. Priority: artist → host → genre. Only one
  // shows at a time (a URL with multiple is treated as artist with genre
  // narrowing chips — page-level narrowing lives in the same scope modal).
  const scopeKind: ScopeKind | null = state.artist
    ? "artist"
    : state.host
      ? "host"
      : state.genres.length > 0
        ? "genre"
        : null
  const scopeValue = scopeKind === "artist"
    ? state.artist!
    : scopeKind === "host"
      ? state.host!
      : scopeKind === "genre"
        ? state.genres[0]
        : null

  return (
    <>
      {scopeKind && scopeValue && (
        <ScopeModal
          // Genre transitions (pair → single, bar click) keep the same mounted
          // modal to avoid a remount/animation overlap. Artist + host are keyed
          // by value so switching between them still resets internal state.
          key={scopeKind === "genre" ? "genre-scope" : `${scopeKind}-${scopeValue}`}
          kind={scopeKind}
          value={scopeValue}
          onClose={closeAll}
        />
      )}
      {state.day && (
        <DayModal
          key={state.day}
          date={state.day}
          expectedCount={0}
          onClose={closeAll}
        />
      )}
      {state.upcoming && <UpcomingModal onClose={closeAll} />}
      {/* Album detail renders last so its portal sits on top of scope/day/upcoming. */}
      {state.album && <DeepAlbum id={state.album} onClose={closeAll} />}
    </>
  )
}

// Resolves an album id to a stub and renders AlbumDetail. If the click
// originated from a card on the current page, the stub is already cached
// (artist/title/cover/host) and the modal opens instantly — the full
// fetch runs in parallel inside AlbumDetail for tags/duration. Only deep
// links (pasted URLs, shared links) pay the round-trip before the modal
// can show.
function DeepAlbum({ id, onClose }: { id: string; onClose: () => void }) {
  const [stub, setStub] = useState<AlbumListItem | null>(() => getAlbumStub(id))

  useEffect(() => {
    if (getAlbumStub(id)) return
    const ctrl = new AbortController()
    fetch(`/api/album?id=${id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStub(rpcRowToAlbumListItem(data)) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [id])

  if (!stub) return <DeepAlbumSkeleton onClose={onClose} />
  return <AlbumDetail albumStub={stub} onClose={onClose} />
}
