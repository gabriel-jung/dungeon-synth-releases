import type { ReactNode } from "react"

function SectionDivider() {
  return (
    <div
      aria-hidden
      className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent"
    />
  )
}

export default function StatsLayout({
  head,
  dow,
  month,
  hosts,
  tracks,
  duration,
  genres,
  themes,
}: {
  head: ReactNode
  dow: ReactNode
  month: ReactNode
  hosts: ReactNode
  tracks: ReactNode
  duration: ReactNode
  genres: ReactNode
  themes: ReactNode
}) {
  return (
    <div className="h-full pt-6 sm:pt-10">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10">
          <section>{head}</section>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {dow}
            {month}
          </div>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {hosts}
            <div className="flex flex-col gap-8">
              {tracks}
              {duration}
            </div>
          </div>

          <SectionDivider />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {genres}
            {themes}
          </div>
        </div>
      </div>
    </div>
  )
}
