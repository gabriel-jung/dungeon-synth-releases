import { Suspense } from "react"
import { cacheLife, cacheTag } from "next/cache"
import { supabase, paginateAll } from "@/lib/supabase"
import GenreMap, { GenreCount, GenrePair } from "@/components/GenreMap"
import PageHeader from "@/components/PageHeader"

export const metadata = {
  title: "Genres",
  description: "Interactive force-directed map of dungeon synth genres and their relationships.",
  alternates: { canonical: "/genres" },
}

// Lazy-regenerated on visit. Zero traffic = zero Supabase queries. Cron
// calls /api/revalidate?tag=genres to push a new version when new data
// is ingested upstream.
async function fetchGenresData(): Promise<{ counts: GenreCount[]; pairs: GenrePair[] }> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")

  const [countsRes, pairs] = await Promise.all([
    supabase.rpc("tag_counts").order("n", { ascending: false }),
    paginateAll<{ tag_a: string; tag_b: string; n: number | string }>(
      async (from, to) => {
        const { data, error } = await supabase
          .rpc("tag_pairs")
          .order("n", { ascending: false })
          .order("tag_a", { ascending: true })
          .order("tag_b", { ascending: true })
          .range(from, to)
        if (error) throw new Error(`tag_pairs RPC failed: ${error.message}`)
        return data
      },
    ).then((rows) => rows.map((r) => ({ a: r.tag_a, b: r.tag_b, n: Number(r.n) }))),
  ])
  if (countsRes.error) throw new Error(`tag_counts RPC failed: ${countsRes.error.message}`)

  const counts: GenreCount[] = (countsRes.data ?? []).map(
    (r: { name: string; n: number | string }) => ({ name: r.name, n: Number(r.n) }),
  )
  return { counts, pairs }
}

export default async function GenresPage() {
  const { counts, pairs } = await fetchGenresData()
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="A cartography of genre affinities, drawn from shared Bandcamp tags." />
      <div className="flex-1 min-h-0">
        <Suspense>
          <GenreMap counts={counts} pairs={pairs} />
        </Suspense>
      </div>
    </div>
  )
}
