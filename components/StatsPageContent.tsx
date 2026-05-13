import type { ReactNode } from "react"
import HostRow from "./HostRow"
import TagBarScroll from "./TagBarScroll"
import Histogram, { HistBin } from "./Histogram"
import type { HostCount } from "@/lib/stats"
import type { TagCount } from "@/lib/types"

export default function StatsPageContent({
  head,
  rows,
  genres,
  themes,
  trackBins,
  durationBins,
  dowBins,
  monthBins,
}: {
  head: ReactNode
  rows: HostCount[]
  genres: TagCount[]
  themes: TagCount[]
  trackBins: HistBin[]
  durationBins: HistBin[]
  dowBins: HistBin[]
  monthBins: HistBin[]
}) {
  const hostMax = rows[0]?.n ?? 1
  return (
    <div className="h-full pt-6 sm:pt-8">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10">
          <section>{head}</section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <Histogram title="Releases by Day of Week" bins={dowBins} />
            <Histogram title="Releases by Month" bins={monthBins} />
          </div>
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
                  style={{ maxHeight: "calc(12 * 1.75rem + 11 * 0.125rem + 1rem)", scrollbarWidth: "none" }}
                >
                  {rows.map((row) => (
                    <HostRow
                      key={row.host_id}
                      hostId={row.host_id}
                      name={row.name}
                      count={row.n}
                      widthPct={(row.n / hostMax) * 100}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <TagBarScroll title="Popular Genres" items={genres} rows={12} headingStyle="section" emptyLabel="No tags." />
            <TagBarScroll title="Popular Themes" items={themes} rows={12} headingStyle="section" emptyLabel="No tags." />
          </div>
        </div>
      </div>
    </div>
  )
}
