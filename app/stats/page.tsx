import { supabase } from "@/lib/supabase"
import HostRow from "@/components/HostRow"
import CalendarHeatmap from "@/components/CalendarHeatmap"
import Histogram, { HistBin } from "@/components/Histogram"

export const revalidate = 3600

type HostCount = { host_id: string; name: string; image_id: string | null; url: string | null; n: number }
type DailyCount = { date: string; n: number }
type HistRow = { bucket: string; bucket_order: number; bucket_width: number; n: number | string }

export default async function StatsPage() {
  const year = new Date().getFullYear()
  const [hostRes, dailyRes, tracksHistRes, durationHistRes] = await Promise.all([
    supabase.rpc("host_counts", { p_year: year }),
    supabase.rpc("daily_counts", { p_year: year }),
    supabase.rpc("tracks_per_album_hist", { p_year: year }),
    supabase.rpc("album_duration_hist", { p_year: year }),
  ])

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
        <CalendarHeatmap days={daily} year={year} />
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
