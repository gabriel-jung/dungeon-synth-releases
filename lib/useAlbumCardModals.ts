"use client"

import { useState } from "react"
import { AlbumListItem, isLabelRelease } from "./types"

export function useAlbumCardModals(
  album: Pick<AlbumListItem, "artist" | "host_name" | "host_id">,
  { hideHost = false } = {},
) {
  const [artistModal, setArtistModal] = useState(false)
  const [hostModal, setHostModal] = useState(false)
  const showHostInline = !hideHost && isLabelRelease(album)
  const onArtistClick = () => {
    if (!showHostInline && album.host_id) setHostModal(true)
    else setArtistModal(true)
  }
  return { artistModal, setArtistModal, hostModal, setHostModal, showHostInline, onArtistClick }
}
