"use client"

export type ViewMode = "grid" | "list"

export default function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="flex border border-border overflow-hidden">
      <button
        onClick={() => setView("grid")}
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        className={`px-2 py-1 text-xs cursor-pointer transition-colors ${
          view === "grid" ? "bg-accent/20 text-text-bright" : "text-text-dim hover:text-text"
        }`}
      >
        <span aria-hidden="true">▦</span>
      </button>
      <button
        onClick={() => setView("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
        className={`px-2 py-1 text-xs cursor-pointer border-l border-border transition-colors ${
          view === "list" ? "bg-accent/20 text-text-bright" : "text-text-dim hover:text-text"
        }`}
      >
        <span aria-hidden="true">☰</span>
      </button>
    </div>
  )
}
