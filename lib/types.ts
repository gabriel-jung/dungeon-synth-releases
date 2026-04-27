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

// Parse an ISO week key (e.g. "2024-W05") into [mondayDate, sundayDate],
// both as YYYY-MM-DD strings (UTC-based). Returns null on invalid input.
export function parseWeekKey(week: string): { start: string; end: string } | null {
  const m = week.match(/^(\d{4})-W(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const w = Number(m[2])
  if (!Number.isInteger(year) || !Number.isInteger(w) || w < 1 || w > 53) return null
  // ISO week 1 contains the first Thursday of the year.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow)
  const weekStart = new Date(week1Monday)
  weekStart.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
  return { start: localDateStr(weekStart), end: localDateStr(weekEnd) }
}

// Inverse of parseWeekKey — format an ISO-8601 date string to "YYYY-Www".
export function weekKeyOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z")
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  // Thursday of current week determines the year and week.
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() - dow + 3)
  const year = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow)
  const week = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1
  return `${year}-W${String(week).padStart(2, "0")}`
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
  return `https://f4.bcbits.com/img/a${artId}${suffix}`
}

export function hostImageUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null
  return `https://f4.bcbits.com/img/${imageId}_10.jpg`
}

// Guard against `javascript:` / `data:` URLs sneaking in from the scraper.
// Only http(s) survives; everything else returns null and the caller skips
// rendering the link.
export function safeExternalHref(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

export interface HostRow {
  id: string
  name: string
  image_id: string | null
  url: string | null
}

export type TagCount = { name: string; n: number }

export function isHostedRelease(album: Pick<AlbumListItem, "artist" | "host_name">): boolean {
  return !!album.host_name && album.host_name.toLowerCase() !== album.artist.toLowerCase()
}

export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

export function pickLatestDate(rows: Pick<AlbumListItem, "date">[]): string | null {
  return rows.reduce<string | null>((best, a) => {
    if (!a.date || a.date === "Unknown") return best
    return !best || a.date > best ? a.date : best
  }, null)
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

export type FilteredAlbumRow = {
  id: string
  artist: string
  title: string
  url: string
  date: string | null
  art_id: string | null
  host_id: string | null
  host_name: string | null
  host_image_id: string | null
  host_url: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAlbumListItem(r: any): AlbumListItem {
  const hosts = r.hosts as unknown as HostRow | null
  return {
    id: String(r.id),
    artist: r.artist,
    title: r.title,
    url: r.url,
    date: r.date,
    art_id: r.art_id,
    host_id: hosts?.id ?? null,
    host_name: hosts?.name ?? null,
    host_image_id: hosts?.image_id ?? null,
    host_url: hosts?.url ?? null,
  }
}

export function rpcRowToAlbumListItem(r: FilteredAlbumRow): AlbumListItem {
  return {
    id: String(r.id),
    artist: r.artist,
    title: r.title,
    url: r.url,
    date: r.date,
    art_id: r.art_id,
    host_id: r.host_id,
    host_name: r.host_name,
    host_image_id: r.host_image_id,
    host_url: r.host_url,
  }
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
