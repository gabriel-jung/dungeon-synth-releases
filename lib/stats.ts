import type { HistBin } from "@/components/Histogram"
import type { TagCount } from "@/lib/types"

export const YEAR_LOWER_BOUND = 1990

export const emptyMsg = (degraded: boolean) =>
  degraded ? "(could not load) ✧" : "(no entries) ✧"

export type HostCount = { host_id: string; name: string; image_id: string | null; url: string | null; n: number }
export type HistRow = { bucket: string; bucket_order: number; bucket_width: number; n: number | string }
export type YearRow = { year: number | string; n: number | string }
export type DayRow = { date: string; n: number | string }
type HostRow = { host_id: string; name: string; image_id: string | null; url: string | null; n: number | string }

export function unwrap<T>(name: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${name} RPC failed: ${res.error.message}`)
  return (res.data ?? ([] as unknown as T))
}

// Returns `fallback` (default empty array) instead of throwing on RPC error.
export function unwrapSafe<T>(
  name: string,
  res: { data: T | null; error: { message: string } | null },
  fallback?: T,
): T {
  if (res.error) {
    console.error(`${name} RPC failed: ${res.error.message}`)
    return fallback ?? ([] as unknown as T)
  }
  return res.data ?? (fallback ?? ([] as unknown as T))
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
