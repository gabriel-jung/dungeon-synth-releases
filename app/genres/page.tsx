import { Suspense } from "react"
import { supabase, paginateAll } from "@/lib/supabase"
import GenreMap, { GenreCount, GenrePair } from "@/components/GenreMap"

export const revalidate = 3600

export const metadata = {
  title: "Genres",
  description: "Interactive force-directed map of dungeon synth genres and their relationships.",
  alternates: { canonical: "/genres" },
}

async function fetchAllPairs(): Promise<GenrePair[]> {
  const rows = await paginateAll<{ tag_a: string; tag_b: string; n: number | string }>(
    async (from, to) => {
      const { data } = await supabase
        .rpc("genre_pairs")
        .order("n", { ascending: false })
        .order("tag_a", { ascending: true })
        .order("tag_b", { ascending: true })
        .range(from, to)
      return data
    },
  )
  return rows.map((r) => ({ a: r.tag_a, b: r.tag_b, n: Number(r.n) }))
}

export default async function GenresPage() {
  const [countsRes, pairs] = await Promise.all([
    supabase.rpc("genre_counts").order("n", { ascending: false }),
    fetchAllPairs(),
  ])

  const counts: GenreCount[] = (countsRes.data ?? []).map(
    (r: { name: string; n: number | string }) => ({ name: r.name, n: Number(r.n) }),
  )

  return (
    <div className="h-full w-full">
      <Suspense>
        <GenreMap counts={counts} pairs={pairs} />
      </Suspense>
    </div>
  )
}
