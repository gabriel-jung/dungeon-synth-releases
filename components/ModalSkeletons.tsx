// Shared loading and error placeholders used across modals.

export function GridSkeleton({ count, reserveLoadMore = false }: { count: number; reserveLoadMore?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 animate-pulse">
        {Array.from({ length: Math.min(count, 20) }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="aspect-square bg-bg-card border border-border" />
            {/* Mirrors GridCard's 4-row text stack (title / artist / host /
                date) one-for-one so skeleton card height = loaded card height. */}
            <div aria-hidden="true" className="flex flex-col min-w-0 px-0.5">
              <span className="text-[0.8rem] leading-snug font-medium text-transparent bg-bg-card/80 rounded-sm w-3/4">&nbsp;</span>
              <span className="text-xs text-transparent bg-bg-card/60 rounded-sm w-1/2">&nbsp;</span>
              <span className="font-display tracking-wide uppercase text-[10px] text-transparent bg-bg-card/50 rounded-sm w-2/5">&nbsp;</span>
              <span className="text-[10px] tracking-wide tabular-nums text-transparent bg-bg-card/50 rounded-sm w-1/3 mt-0.5">&nbsp;</span>
            </div>
          </div>
        ))}
      </div>
      {reserveLoadMore && (
        <div className="mt-4 flex justify-center">
          <div className="w-40 h-7 bg-bg-card animate-pulse" />
        </div>
      )}
    </>
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
