import { supabase } from "@/lib/supabase"
import { parseTagParams, localDateStr } from "@/lib/types"
import HostRow from "@/components/HostRow"
import CalendarHeatmap from "@/components/CalendarHeatmap"
import Histogram, { HistBin } from "@/components/Histogram"

export const revalidate = 21600

export const metadata = {
  title: "Stats",
  description: "Release activity, top labels, and calendar heatmap for dungeon synth on Bandcamp.",
  alternates: { canonical: "/stats" },
}

type HostCount = { host_id: string; name: string; image_id: string | null; url: string | null; n: number }
type DailyCount = { date: string; n: number }
type HistRow = { bucket: string; bucket_order: number; bucket_width: number; n: number | string }

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)

  const year = new Date().getUTCFullYear()
  const rpcArgs = { p_year: year, p_include_tags: includeTags, p_exclude_tags: excludeTags }
  const [hostRes, dailyRes, tracksHistRes, durationHistRes] = await Promise.all([
    supabase.rpc("host_counts", rpcArgs),
    supabase.rpc("daily_counts", rpcArgs),
    supabase.rpc("tracks_per_album_hist", rpcArgs),
    supabase.rpc("album_duration_hist", rpcArgs),
  ])
  if (hostRes.error) throw new Error(`host_counts RPC failed: ${hostRes.error.message}`)
  if (dailyRes.error) throw new Error(`daily_counts RPC failed: ${dailyRes.error.message}`)
  if (tracksHistRes.error) throw new Error(`tracks_per_album_hist RPC failed: ${tracksHistRes.error.message}`)
  if (durationHistRes.error) throw new Error(`album_duration_hist RPC failed: ${durationHistRes.error.message}`)

  const rows: HostCount[] = (hostRes.data ?? []).slice(0, 50).map(
    (r: { host_id: string; name: string; image_id: string | null; url: string | null; n: number | string }) => ({
      host_id: r.host_id,
      name: r.name,
      image_id: r.image_id,
      url: r.url,
      n: Number(r.n),
    }),
  )
  const max = rows[0]?.n ?? 1

  const daily: DailyCount[] = (dailyRes.data ?? []).map(
    (r: { date: string; n: number | string }) => ({ date: r.date, n: Number(r.n) }),
  )

  const toBins = (data: HistRow[] | null): HistBin[] =>
    (data ?? [])
      .sort((a, b) => a.bucket_order - b.bucket_order)
      .map((r) => ({ label: r.bucket, count: Number(r.n), width: Number(r.bucket_width) }))

  const trackBins = toBins(tracksHistRes.data)
  const durationBins = toBins(durationHistRes.data)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 overflow-y-auto h-full flex flex-col gap-10" style={{ scrollbarWidth: "none" }}>
      <section>
        <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-4">
          Daily Release Activity
        </h2>
        <CalendarHeatmap days={daily} year={year} today={localDateStr(new Date())} />
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <section>
          <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-4">
            Most Active Pages
          </h2>
          <div
            className="relative"
            style={{
              maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
            }}
          >
            <ol
              className="flex flex-col gap-0.5 overflow-y-auto pr-1"
              style={{ maxHeight: "calc(12 * 1.75rem + 11 * 0.125rem + 1rem)", scrollbarWidth: "none"}}
            >
              {rows.map((row) => (
                <HostRow
                  key={row.host_id}
                  hostId={row.host_id}
                  name={row.name}
                  imageId={row.image_id}
                  url={row.url}
                  count={row.n}
                  widthPct={(row.n / max) * 100}
                  year={year}
                />
              ))}
            </ol>
          </div>
        </section>
        <div className="flex flex-col gap-8">
          <Histogram title="Tracks per Release" bins={trackBins} />
          <Histogram title="Release Duration" bins={durationBins} />
        </div>
      </div>
    </div>
  )
}
