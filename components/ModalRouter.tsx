"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlbumListItem, rpcRowToAlbumListItem } from "@/lib/types"
import { closeModal, readModalState, toQueryString, type ModalKind } from "@/lib/modalUrl"
import { getAlbumStub } from "@/lib/albumCache"
import AlbumDetail from "./AlbumDetail"
import ScopeModal, { type ScopeKind } from "./ScopeModal"
import DayModal from "./DayModal"
import UpcomingModal from "./UpcomingModal"

// Single source of truth for which modals are open. Reads URL params and
// renders the corresponding modals in a stable order so the focus-trap stack
// in `lib/useModal` always pops in the right sequence.
export default function ModalRouter() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const state = readModalState(searchParams as unknown as URLSearchParams)

  const close = useCallback(
    (kind: ModalKind, value?: string) => {
      const current = new URLSearchParams(searchParams.toString())
      const next = closeModal(current, kind, value)
      router.push(`${pathname}${toQueryString(next)}`)
    },
    [router, pathname, searchParams],
  )

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
          key={`${scopeKind}-${scopeValue}`}
          kind={scopeKind}
          value={scopeValue}
          onClose={() => close(scopeKind === "genre" ? "genre" : scopeKind, scopeKind === "genre" ? scopeValue : undefined)}
        />
      )}
      {state.day && (
        <DayModal
          key={state.day}
          date={state.day}
          expectedCount={0}
          onClose={() => close("day")}
        />
      )}
      {state.upcoming && <UpcomingModal onClose={() => close("upcoming")} />}
      {/* Album detail renders last so its portal sits on top of scope/day/upcoming. */}
      {state.album && <DeepAlbum id={state.album} onClose={() => close("album")} />}
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
    setStub(null)
    fetch(`/api/album?id=${id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStub(rpcRowToAlbumListItem(data)) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [id])

  if (!stub) return null
  return <AlbumDetail albumStub={stub} onClose={onClose} />
}
