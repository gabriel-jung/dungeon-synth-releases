"use client"

import Link from "next/link"
import { Fragment } from "react"
import { usePathname } from "next/navigation"
import { NAV_ACTIVE, NAV_INACTIVE, NAV_ITEM, NavSep } from "./YearDropdown"

export type ScopeItem = { href: string; label: string; match: (pathname: string) => boolean }

export default function ScopeNav({ items, fallback }: { items: ScopeItem[]; fallback: string }) {
  const pathname = usePathname() ?? fallback
  return (
    <div className="flex items-center gap-2">
      {items.map((item, i) => {
        const active = item.match(pathname)
        return (
          <Fragment key={item.href}>
            {i > 0 && <NavSep />}
            <Link
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`${NAV_ITEM} ${active ? NAV_ACTIVE : NAV_INACTIVE}`}
            >
              {item.label}
            </Link>
          </Fragment>
        )
      })}
    </div>
  )
}
