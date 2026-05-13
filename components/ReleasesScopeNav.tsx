"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { useOpenModal } from "@/lib/useModalUrl"
import { tagFilterQs, yearFromPath } from "@/lib/types"
import YearDropdown, { NAV_ACTIVE, NAV_INACTIVE, NAV_ITEM, NavSep } from "./YearDropdown"

// Scope nav for the releases area: Recent · Past Years ▾ · Upcoming
// One visual vocabulary for all three. No counts, no badges.
export default function ReleasesScopeNav({ pastYears = [] }: { pastYears?: number[] }) {
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const tagQs = useMemo(() => tagFilterQs(searchParams), [searchParams])
  const withQs = (p: string) => (tagQs ? `${p}?${tagQs}` : p)

  const onRecent = pathname === "/"
  const onYear = pathname.startsWith("/releases/")
  const openModal = useOpenModal()
  const openUpcoming = () => openModal("upcoming", true)

  return (
    <div className="flex items-center gap-2">
      <Link
        href={withQs("/")}
        prefetch
        aria-current={onRecent ? "page" : undefined}
        className={`${NAV_ITEM} ${onRecent ? NAV_ACTIVE : NAV_INACTIVE}`}
      >
        Recent
      </Link>
      <NavSep />
      {pastYears.length > 0 ? (
        <YearDropdown
          years={pastYears}
          active={onYear}
          activeYear={yearFromPath(pathname)}
          idleLabel="Past years"
          hrefFor={(y) => withQs(`/releases/${y}`)}
        />
      ) : (
        <span className={`${NAV_ITEM} text-border`}>Past years</span>
      )}
      <NavSep />
      <button type="button" onClick={openUpcoming} className={`${NAV_ITEM} ${NAV_INACTIVE}`}>
        Upcoming
      </button>
    </div>
  )
}
