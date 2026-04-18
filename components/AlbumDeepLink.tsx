"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { AlbumListItem } from "@/lib/types"
import { rpcRowToAlbumListItem } from "@/lib/supabase"
import { has } from "@/lib/albumRegistry"
import AlbumDetail from "./AlbumDetail"

export default function AlbumDeepLink() {
  const sp = useSearchParams()
  const urlId = sp.get("album")
  const [stub, setStub] = useState<AlbumListItem | null>(null)

  useEffect(() => {
    setStub(null)
    if (!urlId || has(urlId)) return
    let cancelled = false
    fetch(`/api/album?id=${urlId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setStub(rpcRowToAlbumListItem(data)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [urlId])

  if (!stub) return null
  return <AlbumDetail albumStub={stub} onClose={() => setStub(null)} />
}
