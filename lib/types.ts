export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from + "T00:00:00")
  const end = new Date(to + "T00:00:00")
  const step = start <= end ? 1 : -1
  for (let d = start; step > 0 ? d <= end : d >= end; d = new Date(d.getTime() + step * 86400000)) {
    dates.push(localDateStr(d))
  }
  return dates
}

const _today = () => localDateStr(new Date())
const _yesterday = () => localDateStr(new Date(Date.now() - 86400000))

function relativeOrFormat(date: string, fmt: Intl.DateTimeFormatOptions): string {
  if (date === _today()) return "Today"
  if (date === _yesterday()) return "Yesterday"
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", fmt)
}

export function formatDateHeading(date: string, includeYear = false): string {
  const fmt: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }
  if (includeYear) fmt.year = "numeric"
  return relativeOrFormat(date, fmt)
}

export function formatDateShort(date: string): string {
  return relativeOrFormat(date, { month: "short", day: "numeric" })
}

export function coverUrl(artId: string | null | undefined, size: "thumb" | "full" = "full"): string | null {
  if (!artId) return null
  // _7 = 150px thumb (grid), _2 = 350px (detail)
  const suffix = size === "thumb" ? "_7.jpg" : "_2.jpg"
  return `/api/cover?url=${encodeURIComponent(`https://f4.bcbits.com/img/a${artId}${suffix}`)}`
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
