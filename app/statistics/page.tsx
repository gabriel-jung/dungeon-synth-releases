import { Suspense } from "react"
import { connection } from "next/server"
import { parseTagParams } from "@/lib/types"
import StatsLayout from "@/components/StatsLayout"
import {
  YearBarChapter,
  DowChapter,
  MonthChapter,
  HostsChapter,
  TracksChapter,
  DurationChapter,
  GenresChapter,
  ThemesChapter,
  type StatsFilter,
} from "@/components/StatsChapters"
import {
  YearBarSkeleton,
  DowSkeleton,
  MonthSkeleton,
  HostsSkeleton,
  TracksSkeleton,
  DurationSkeleton,
  GenresSkeleton,
  ThemesSkeleton,
} from "@/components/StatsSkeleton"

export const metadata = {
  title: "Statistics",
  description: "Release activity across years, top labels, and distributions for dungeon synth on Bandcamp.",
  alternates: { canonical: "/statistics" },
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)
  const currentYear = new Date().getUTCFullYear()
  const filter: StatsFilter = { include: includeTags, exclude: excludeTags, year: null }

  return (
    <StatsLayout
      head={
        <Suspense fallback={<YearBarSkeleton />}>
          <YearBarChapter filter={filter} currentYear={currentYear} />
        </Suspense>
      }
      dow={
        <Suspense fallback={<DowSkeleton />}>
          <DowChapter filter={filter} />
        </Suspense>
      }
      month={
        <Suspense fallback={<MonthSkeleton />}>
          <MonthChapter filter={filter} />
        </Suspense>
      }
      hosts={
        <Suspense fallback={<HostsSkeleton />}>
          <HostsChapter filter={filter} />
        </Suspense>
      }
      tracks={
        <Suspense fallback={<TracksSkeleton />}>
          <TracksChapter filter={filter} />
        </Suspense>
      }
      duration={
        <Suspense fallback={<DurationSkeleton />}>
          <DurationChapter filter={filter} />
        </Suspense>
      }
      genres={
        <Suspense fallback={<GenresSkeleton />}>
          <GenresChapter filter={filter} />
        </Suspense>
      }
      themes={
        <Suspense fallback={<ThemesSkeleton />}>
          <ThemesChapter filter={filter} />
        </Suspense>
      }
    />
  )
}
