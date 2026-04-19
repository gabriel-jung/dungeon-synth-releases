"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export default function FilterChips() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const emphasized = searchParams.getAll("tag")
  const banned = searchParams.getAll("xtag")
  if (emphasized.length === 0 && banned.length === 0) return null

  const writeParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const removeTag = (kind: "tag" | "xtag", value: string) => {
    writeParams((p) => {
      const remaining = p.getAll(kind).filter((t) => t !== value)
      p.delete(kind)
      for (const t of remaining) p.append(kind, t)
    })
  }

  const clearAll = () => {
    writeParams((p) => {
      p.delete("tag")
      p.delete("xtag")
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {emphasized.map((t) => (
        <FilterChip key={`e-${t}`} kind="include" tag={t} onClear={() => removeTag("tag", t)} />
      ))}
      {banned.map((t) => (
        <FilterChip key={`b-${t}`} kind="exclude" tag={t} onClear={() => removeTag("xtag", t)} />
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer pl-1"
      >
        clear
      </button>
    </div>
  )
}

function FilterChip({
  kind,
  tag,
  onClear,
}: {
  kind: "include" | "exclude"
  tag: string
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
      <span className={isInclude ? "" : "line-through"}>{tag}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${tag}`}
        className="ml-0.5 text-sm leading-none text-current opacity-70 hover:opacity-100 cursor-pointer"
      >
        ×
      </button>
    </span>
  )
}
