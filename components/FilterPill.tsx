"use client"

export default function FilterPill({
  kind,
  label,
  onClear,
}: {
  kind: "include" | "exclude"
  label: string
  onClear: () => void
}) {
  const isInclude = kind === "include"
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] tracking-wide px-1.5 py-0.5 ${
        isInclude
          ? "bg-tag-include/15 text-tag-include border-b border-tag-include/70"
          : "bg-tag-exclude/15 text-tag-exclude border-b border-tag-exclude/70"
      }`}
    >
      <span aria-hidden className="text-[9px] opacity-80">
        {isInclude ? "✦" : "⊘"}
      </span>
      <span className={isInclude ? "" : "line-through"}>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="ml-0.5 text-sm leading-none text-current opacity-70 hover:opacity-100 cursor-pointer"
      >
        ×
      </button>
    </span>
  )
}
