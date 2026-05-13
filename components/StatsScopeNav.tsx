"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { yearFromPath } from "@/lib/types"
import YearDropdown, { NAV_ACTIVE, NAV_INACTIVE, NAV_ITEM, NavSep } from "./YearDropdown"

export default function StatsScopeNav({ years }: { years: number[] }) {
  const pathname = usePathname() ?? "/statistics"
  const onOverall = pathname === "/statistics"
  const onByYear = pathname.startsWith("/statistics/by-year")
  const activeYear = onByYear ? yearFromPath(pathname) : null

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/statistics"
        prefetch
        aria-current={onOverall ? "page" : undefined}
        className={`${NAV_ITEM} ${onOverall ? NAV_ACTIVE : NAV_INACTIVE}`}
      >
        Overall
      </Link>
      <NavSep />
      <YearDropdown
        years={years}
        active={onByYear}
        activeYear={activeYear}
        idleLabel="By year"
        hrefFor={(y) => `/statistics/by-year/${y}`}
      />
    </div>
  )
}
