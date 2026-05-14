import type { HistBin } from "@/components/Histogram"
import type { TagCount } from "@/lib/types"

export const YEAR_LOWER_BOUND = 1990

export const emptyMsg = (degraded: boolean) =>
  degraded ? "(could not load) ✧" : "(no entries) ✧"

// Single source of truth for the cache sub-tags every stats chapter declares.
// Consumed by the per-chunk fetchers in StatsChapters.tsx and by the
// retryStatsChunk Server Action's allow-list. Keeping the list in one place
// makes it impossible for the two sides to drift (e.g. adding a chapter but
// forgetting to extend the allow-list, blocking its retry).
export const STATS_CHUNK_TAGS = [
  "stats:years",
  "stats:heatmap",
  "stats:dow",
  "stats:month",
  "stats:hosts",
  "stats:tracks",
  "stats:duration",
  "stats:genres",
  "stats:themes",
] as const
export type StatsChunkTag = (typeof STATS_CHUNK_TAGS)[number]

// Catch + log helper for wrapping a strict-throw fetcher (e.g. one inside
// a `"use cache"` boundary) without putting JSX in try/catch. Returns null
// on failure so callers can branch on data presence.
export async function tryOrNull<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    console.error(`${label}:`, e)
    return null
  }
}

export type HostCount = { host_id: string; name: string; image_id: string | null; url: string | null; n: number }
export type HistRow = { bucket: string; bucket_order: number; bucket_width: number; n: number | string }
export type YearRow = { year: number | string; n: number | string }
export type DayRow = { date: string; n: number | string }
type HostRow = { host_id: string; name: string; image_id: string | null; url: string | null; n: number | string }

export function unwrap<T>(name: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${name} RPC failed: ${res.error.message}`)
  return (res.data ?? ([] as unknown as T))
}

export function toHostCounts(data: HostRow[] | null, limit = 50): HostCount[] {
  return (data ?? []).slice(0, limit).map((r) => ({
    host_id: r.host_id,
    name: r.name,
    image_id: r.image_id,
    url: r.url,
    n: Number(r.n),
  }))
}

export function toTagCounts(data: { name: string; n: number | string }[] | null): TagCount[] {
  return (data ?? []).map((r) => ({ name: r.name, n: Number(r.n) }))
}

export function toBins(data: HistRow[] | null): HistBin[] {
  return (data ?? [])
    .sort((a, b) => a.bucket_order - b.bucket_order)
    .map((r) => ({ label: r.bucket, count: Number(r.n), width: Number(r.bucket_width) }))
}
