"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { tagFilterQs, yearFromPath } from "@/lib/types"
import YearDropdown, { NAV_ACTIVE, NAV_INACTIVE, NAV_ITEM, NavSep } from "./YearDropdown"

export default function StatsScopeNav({ years }: { years: number[] }) {
  const pathname = usePathname() ?? "/statistics"
  const searchParams = useSearchParams()
  const tagQs = useMemo(() => tagFilterQs(searchParams), [searchParams])
  const withQs = (p: string) => (tagQs ? `${p}?${tagQs}` : p)

  const onOverall = pathname === "/statistics"
  const onByYear = pathname.startsWith("/statistics/by-year")
  const activeYear = onByYear ? yearFromPath(pathname) : null

  return (
    <div className="flex items-center gap-2">
      <Link
        href={withQs("/statistics")}
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
        hrefFor={(y) => withQs(`/statistics/by-year/${y}`)}
      />
    </div>
  )
}
