// UTC-based to keep server and client agreeing on "today" across day
// rollovers — previously this used runtime-local time, so a page rendered
// at 23:30 UTC would stamp the wrong date for a client already past midnight.
export function localDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function releaseCount(n: number): string {
  return `${n.toLocaleString()} release${n === 1 ? "" : "s"}`
}

type TagParamsInput = { tag?: string | string[]; xtag?: string | string[] }
export function parseTagParams(sp: TagParamsInput): { includeTags: string[]; excludeTags: string[] } {
  const norm = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : [])
  return { includeTags: norm(sp.tag), excludeTags: norm(sp.xtag) }
}

export function buildSplitUrl(opts: {
  artist?: string
  hostId?: string
  year?: number
  tags: string[]
  xtags: string[]
}): string {
  const qs = new URLSearchParams()
  if (opts.artist) qs.set("artist", opts.artist)
  if (opts.hostId) qs.set("host_id", opts.hostId)
  if (opts.year) qs.set("year", String(opts.year))
  for (const t of opts.tags) qs.append("tag", t)
  for (const t of opts.xtags) qs.append("xtag", t)
  return `/api/albums/split?${qs.toString()}`
}

export function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from + "T00:00:00Z")
  const end = new Date(to + "T00:00:00Z")
  const step = start <= end ? 1 : -1
  for (let d = start; step > 0 ? d <= end : d >= end; d = new Date(d.getTime() + step * 86400000)) {
    dates.push(localDateStr(d))
  }
  return dates
}

const _today = () => localDateStr(new Date())
const _yesterday = () => localDateStr(new Date(Date.now() - 86400000))

// "Today"/"Yesterday" is time-dependent and must only be evaluated on the client
// to avoid SSR/hydration mismatches across day rollovers (and cache boundaries).
export function relativeDayLabel(date: string): string | null {
  if (date === _today()) return "Today"
  if (date === _yesterday()) return "Yesterday"
  return null
}

export function formatDateHeading(date: string, includeYear = false): string {
  const fmt: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }
  if (includeYear) fmt.year = "numeric"
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", fmt)
}

export function formatDateShort(date: string, includeYear = false): string {
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  if (includeYear) fmt.year = "numeric"
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", fmt)
}

export function coverUrl(artId: string | null | undefined, size: "thumb" | "full" = "full"): string | null {
  if (!artId) return null
  // _7 = 150px thumb (grid), _2 = 350px (detail)
  const suffix = size === "thumb" ? "_7.jpg" : "_2.jpg"
  return `/api/cover?url=${encodeURIComponent(`https://f4.bcbits.com/img/a${artId}${suffix}`)}`
}

export function hostImageUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null
  return `/api/cover?url=${encodeURIComponent(`https://f4.bcbits.com/img/${imageId}_10.jpg`)}`
}

export function searchFor(value: string) {
  const params = new URLSearchParams(window.location.search)
  if (value) params.set("q", value)
  else params.delete("q")
  const qs = params.toString()
  // On the genres page, keep the reader in the visualization so the query
  // can drive node highlighting instead of sending them to the release list.
  const stayHere = window.location.pathname.startsWith("/genres")
  const path = stayHere ? window.location.pathname : "/"
  window.history.replaceState(null, "", qs ? `${path}?${qs}` : path)
  window.dispatchEvent(new CustomEvent("search-change", { detail: value }))
}

export interface HostRow {
  id: string
  name: string
  image_id: string | null
  url: string | null
}

export function isLabelRelease(album: Pick<AlbumListItem, "artist" | "host_name">): boolean {
  return !!album.host_name && album.host_name.toLowerCase() !== album.artist.toLowerCase()
}

export interface AlbumListItem {
  id: string
  artist: string
  title: string
  url: string
  date: string | null
  art_id?: string | null
  host_id?: string | null
  host_name?: string | null
  host_image_id?: string | null
  host_url?: string | null
}

export interface Album extends AlbumListItem {
  art_id: string | null
  host_id: string | null
  host_name: string | null
  host_image_id: string | null
  host_url: string | null
  tags: string[]
  num_tracks: number
  duration_sec: number
}
