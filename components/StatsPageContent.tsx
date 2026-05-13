import type { ReactNode } from "react"
import HostRow from "./HostRow"
import TagBarScroll from "./TagBarScroll"
import Histogram, { HistBin } from "./Histogram"
import SectionHeader from "./SectionHeader"
import type { HostCount } from "@/lib/stats"
import type { TagCount } from "@/lib/types"

const HOST_ROWS = 12
const HOST_LIST_MAX_HEIGHT = `calc(${HOST_ROWS} * 1.75rem + ${HOST_ROWS - 1} * 0.125rem + 1rem)`

function SectionDivider() {
  return (
    <div
      aria-hidden
      className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent"
    />
  )
}

export default function StatsPageContent({
  head,
  rows,
  genres,
  themes,
  trackBins,
  durationBins,
  dowBins,
  monthBins,
  emptyLabel,
}: {
  head: ReactNode
  rows: HostCount[]
  genres: TagCount[]
  themes: TagCount[]
  trackBins: HistBin[]
  durationBins: HistBin[]
  dowBins: HistBin[]
  monthBins: HistBin[]
  emptyLabel: string
}) {
  const hostMax = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="h-full pt-6 sm:pt-10">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10">
          <section>{head}</section>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <Histogram chapter="II" title="Releases by Day of Week" bins={dowBins} />
            <Histogram chapter="III" title="Releases by Month" bins={monthBins} />
          </div>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <section>
              <SectionHeader chapter="IV" title="Most Active Pages" />
              {rows.length === 0 ? (
                <div
                  className="flex items-center justify-center font-display text-xs tracking-[0.2em] uppercase text-text-dim"
                  style={{ height: HOST_LIST_MAX_HEIGHT }}
                >
                  {emptyLabel}
                </div>
              ) : (
                <div
                  className="relative"
                  style={{
                    maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
                  }}
                >
                  <ol
                    className="flex flex-col gap-0.5 overflow-y-auto pr-1"
                    style={{ maxHeight: HOST_LIST_MAX_HEIGHT, scrollbarWidth: "none" }}
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
              )}
            </section>
            <div className="flex flex-col gap-8">
              <Histogram chapter="V" title="Tracks per Release" bins={trackBins} />
              <Histogram chapter="VI" title="Release Duration" bins={durationBins} />
            </div>
          </div>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <TagBarScroll
              chapter="VII"
              title="Popular Genres"
              items={genres}
              rows={HOST_ROWS}
              headingStyle="section"
              emptyLabel={emptyLabel}
            />
            <TagBarScroll
              chapter="VIII"
              title="Popular Themes"
              items={themes}
              rows={HOST_ROWS}
              headingStyle="section"
              emptyLabel={emptyLabel}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
