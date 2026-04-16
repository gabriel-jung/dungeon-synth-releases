// Shared skeletons and error state for ReleasesModal and GenreModal

export function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 animate-pulse">
      {Array.from({ length: Math.min(count, 20) }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="aspect-square bg-bg-card border border-border" />
          <div className="h-3 bg-bg-card w-3/4" />
          <div className="h-2.5 bg-bg-card w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 animate-pulse">
      {Array.from({ length: Math.min(count, 30) }).map((_, i) => (
        <div key={i} className="py-2.5 pl-2 border-l-2 border-transparent">
          <div className="h-3 bg-bg-card w-1/2 mb-1.5" />
          <div className="h-3 bg-bg-card w-3/4" />
        </div>
      ))}
    </div>
  )
}

export function FetchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-8 flex flex-col items-center gap-2 text-text-dim font-display text-xs tracking-wide">
      <span>Failed to load releases</span>
      <button
        onClick={onRetry}
        className="text-accent hover:text-accent-hover transition-colors cursor-pointer uppercase tracking-[0.2em] text-[10px]"
      >
        Retry
      </button>
    </div>
  )
}
