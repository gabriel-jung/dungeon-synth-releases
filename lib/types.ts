export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function formatDateHeading(date: string): string {
  const d = new Date(date + "T00:00:00")
  const now = new Date()
  const today = localDateStr(now)
  const yesterday = localDateStr(new Date(now.getTime() - 86400000))
  if (date === today) return "Today"
  if (date === yesterday) return "Yesterday"
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export function formatDateShort(date: string): string {
  const now = new Date()
  const today = localDateStr(now)
  const yesterday = localDateStr(new Date(now.getTime() - 86400000))
  if (date === today) return "Today"
  if (date === yesterday) return "Yesterday"
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function coverUrl(artId: string | null | undefined): string | null {
  if (!artId) return null
  return `/api/cover?url=${encodeURIComponent(`https://f4.bcbits.com/img/a${artId}_2.jpg`)}`
}

export function searchFor(value: string) {
  const params = new URLSearchParams(window.location.search)
  if (value) params.set("q", value)
  else params.delete("q")
  const qs = params.toString()
  window.history.replaceState(null, "", qs ? `/?${qs}` : "/")
  window.dispatchEvent(new CustomEvent("search-change", { detail: value }))
}

export interface AlbumListItem {
  id: string
  artist: string
  title: string
  url: string
  date: string | null
  art_id?: string | null
  host_name?: string | null
}

export interface Album extends AlbumListItem {
  art_id: string | null
  host_id: string | null
  host_name: string | null
  tags: string[]
  num_tracks: number
  duration_sec: number
}
