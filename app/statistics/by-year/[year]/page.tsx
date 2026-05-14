import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { parseTagParams } from "@/lib/types"
import { YEAR_LOWER_BOUND } from "@/lib/stats"
import StatsLayout from "@/components/StatsLayout"
import {
  HeatmapChapter,
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
  HeatmapSkeleton,
  DowSkeleton,
  MonthSkeleton,
  HostsSkeleton,
  TracksSkeleton,
  DurationSkeleton,
  GenresSkeleton,
  ThemesSkeleton,
} from "@/components/StatsSkeleton"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year } = await params
  return {
    title: `Statistics, ${year}`,
    description: `Dungeon synth release activity in ${year}.`,
    alternates: { canonical: `/statistics/by-year/${year}` },
  }
}

export default async function StatsByYearPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const { year: yearParam } = await params
  const year = Number(yearParam)
  const currentYear = new Date().getUTCFullYear()
  if (!Number.isInteger(year) || year < YEAR_LOWER_BOUND || year > currentYear) notFound()

  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)
  const filter: StatsFilter = { include: includeTags, exclude: excludeTags, year }
  const today = new Date().toISOString().slice(0, 10)

  return (
    <StatsLayout
      head={
        <Suspense fallback={<HeatmapSkeleton />}>
          <HeatmapChapter filter={filter} today={today} />
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
