export default function StatsSkeleton({ headHeight = "h-40" }: { headHeight?: string }) {
  return (
    <div className="h-full pt-6 sm:pt-8">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10 animate-pulse">
          <div className={`${headHeight} bg-bg-card border border-border`} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="h-40 bg-bg-card border border-border" />
            <div className="h-40 bg-bg-card border border-border" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="h-72 bg-bg-card border border-border" />
            <div className="flex flex-col gap-8">
              <div className="h-32 bg-bg-card border border-border" />
              <div className="h-32 bg-bg-card border border-border" />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="h-72 bg-bg-card border border-border" />
            <div className="h-72 bg-bg-card border border-border" />
          </div>
        </div>
      </div>
    </div>
  )
}
