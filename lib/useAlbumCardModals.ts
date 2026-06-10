"use client"

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { AlbumListItem, isHostedRelease } from "./types"
import { hrefWithModal, pushModalUrl, type ModalKind } from "./modalUrl"
import { cacheAlbumStub, cacheArtistArt, cacheHostStub } from "./albumCache"

// Returns URL-push handlers for the click targets on a release card. Modal
// state lives in the URL and is rendered centrally by ModalRouter.
export function useAlbumCardModals(
  album: AlbumListItem | Pick<AlbumListItem, "artist" | "host_name" | "host_id">,
  { hideHost = false } = {},
) {
  const pathname = usePathname()

  const push = useCallback(
    (kind: ModalKind, value: string | number) => {
      // Seed the matching stub cache before opening the modal so the target
      // can render header data synchronously. The server fetch still runs
      // to stream in the full album list.
      const a = album as AlbumListItem
      if (kind === "album" && a.id) {
        cacheAlbumStub(a)
      } else if (kind === "host" && a.host_id) {
        cacheHostStub({
          id: a.host_id,
          name: a.host_name ?? "",
          image_id: a.host_image_id ?? null,
          url: a.host_url ?? null,
        })
      } else if (kind === "artist" && a.artist && a.art_id) {
        cacheArtistArt(a.artist, a.art_id)
      }
      const sp = new URLSearchParams(window.location.search)
      pushModalUrl(hrefWithModal(sp, kind, value, pathname))
    },
    [pathname, album],
  )

  const showHostInline = !hideHost && isHostedRelease(album)

  const openArtist = useCallback(() => push("artist", album.artist), [push, album.artist])
  const openHost = useCallback(() => {
    if (album.host_id) push("host", album.host_id)
  }, [push, album.host_id])

  // The artist line opens the host/label only in the normal feed, and only
  // for a self-hosted release (artist IS the host), where the artist line
  // stands in for the label. Inside a host scope modal (hideHost) we're
  // already viewing that label, so the artist line always opens the artist
  // instead of re-opening the same host (which looked clickable but no-op'd).
  const onArtistClick = useCallback(() => {
    if (!hideHost && !isHostedRelease(album) && album.host_id) openHost()
    else openArtist()
  }, [hideHost, album, openArtist, openHost])

  return { showHostInline, onArtistClick, openArtist, openHost, push }
}
