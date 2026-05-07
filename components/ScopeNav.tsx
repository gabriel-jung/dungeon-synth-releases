"use client"

import Link from "next/link"
import { Fragment } from "react"
import { usePathname } from "next/navigation"

const ITEM = "font-display text-[11px] tracking-[0.15em] uppercase transition-colors py-1 cursor-pointer"
const INACTIVE = "text-text-dim hover:text-text"
const ACTIVE = "text-accent"

export type ScopeItem = { href: string; label: string; match: (pathname: string) => boolean }

export default function ScopeNav({ items, fallback }: { items: ScopeItem[]; fallback: string }) {
  const pathname = usePathname() ?? fallback
  return (
    <div className="flex items-center gap-2">
      {items.map((item, i) => {
        const active = item.match(pathname)
        return (
          <Fragment key={item.href}>
            {i > 0 && <Sep />}
            <Link
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`${ITEM} ${active ? ACTIVE : INACTIVE}`}
            >
              {item.label}
            </Link>
          </Fragment>
        )
      })}
    </div>
  )
}

function Sep() {
  return <span aria-hidden className="text-border text-[10px] leading-none select-none">·</span>
}
