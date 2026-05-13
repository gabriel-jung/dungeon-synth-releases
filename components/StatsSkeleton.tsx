const YEAR_PROFILE = [
  4, 4, 5, 6, 6, 7, 8, 10, 11, 13, 16, 19, 22, 26, 30, 34, 38, 42, 46, 50,
  56, 62, 68, 74, 80, 84, 88, 92, 95, 97, 99, 100, 92, 70, 45, 22, 8,
]
const DOW_PROFILE = [62, 84, 78, 92, 96, 48, 28]
const MONTH_PROFILE = [78, 68, 88, 58, 64, 74, 48, 54, 80, 96, 92, 86]
const TRACKS_PROFILE = [10, 50, 88, 80, 60, 40, 30, 25, 20, 15, 10, 8, 6, 4]
const DURATION_PROFILE = [10, 30, 70, 90, 100, 80, 60, 40, 25]
const RANK_PROFILE = [100, 90, 80, 73, 65, 58, 50, 44, 38, 32, 27, 22]

function Bars({ profile, h }: { profile: number[]; h: string }) {
  return (
    <div className={`flex items-end gap-[3px] ${h}`}>
      {profile.map((pct, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 flex items-end"
          style={{ height: "100%" }}
        >
          <div
            className="w-full animate-skeleton-step"
            style={{
              height: `${pct}%`,
              animationDelay: `${i * 35}ms`,
              background: "var(--color-plot-bar-min)",
            }}
          />
        </div>
      ))}
    </div>
  )
}

function SectionHead({ chapter, title }: { chapter: string; title: string }) {
  return (
    <div className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-dim/60 mb-4">
      <span className="text-accent/60 mr-2 tabular-nums">{chapter}.</span>
      {title}
    </div>
  )
}

function RankedRows() {
  return (
    <ol className="flex flex-col gap-0.5">
      {RANK_PROFILE.map((pct, i) => (
        <li key={i} className="relative h-7 flex items-center">
          <div
            className="animate-skeleton-step h-full"
            style={{
              width: `${pct}%`,
              animationDelay: `${i * 50}ms`,
              background: "var(--color-plot-bar-min)",
            }}
          />
        </li>
      ))}
    </ol>
  )
}

function SkeletonDivider() {
  return (
    <div
      aria-hidden
      className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent opacity-50"
    />
  )
}

export default function StatsSkeleton({ headKind = "year" }: { headKind?: "year" | "heatmap" }) {
  return (
    <div className="h-full pt-6 sm:pt-10">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10">
          <section>
            <SectionHead chapter="I" title={headKind === "year" ? "Releases per Year" : "Daily Release Activity"} />
            {headKind === "year" ? (
              <Bars profile={YEAR_PROFILE} h="h-32" />
            ) : (
              <div className="h-32 bg-bg-card border border-border animate-skeleton-step" />
            )}
          </section>

          <SkeletonDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <SectionHead chapter="II" title="Releases by Day of Week" />
              <Bars profile={DOW_PROFILE} h="h-32" />
            </div>
            <div>
              <SectionHead chapter="III" title="Releases by Month" />
              <Bars profile={MONTH_PROFILE} h="h-32" />
            </div>
          </div>

          <SkeletonDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <section>
              <SectionHead chapter="IV" title="Most Active Pages" />
              <RankedRows />
            </section>
            <div className="flex flex-col gap-8">
              <div>
                <SectionHead chapter="V" title="Tracks per Release" />
                <Bars profile={TRACKS_PROFILE} h="h-32" />
              </div>
              <div>
                <SectionHead chapter="VI" title="Release Duration" />
                <Bars profile={DURATION_PROFILE} h="h-32" />
              </div>
            </div>
          </div>

          <SkeletonDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <section>
              <SectionHead chapter="VII" title="Popular Genres" />
              <RankedRows />
            </section>
            <section>
              <SectionHead chapter="VIII" title="Popular Themes" />
              <RankedRows />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
