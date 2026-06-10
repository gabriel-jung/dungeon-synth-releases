"use client"

import { SEARCH_PALETTE_EVENT } from "./searchPaletteEvent"

// Visible header button that opens the SearchPalette. Keyboard shortcuts
// (⌘K, /) are handled inside SearchPalette itself; this button is for discovery.
export default function SearchTrigger() {
  const open = () => window.dispatchEvent(new CustomEvent(SEARCH_PALETTE_EVENT))

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search the archive"
      className="tap-target flex items-center gap-3 border border-border/60 hover:border-accent/60 px-0 py-0 sm:px-3 sm:py-2 text-text-dim hover:text-text transition-colors cursor-pointer w-7 h-7 sm:w-64 sm:h-auto justify-center sm:justify-between"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true" className="font-display text-base leading-none">⌕</span>
        <span className="hidden sm:inline text-sm italic">
          Search archive…
        </span>
      </span>
      <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 border border-border/50 text-[10px] font-display tracking-wide select-none shrink-0">
        ⌘&nbsp;K
      </kbd>
    </button>
  )
}
