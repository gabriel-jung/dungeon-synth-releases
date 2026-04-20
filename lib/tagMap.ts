import { cacheLife, cacheTag } from "next/cache"
import { supabase, paginateAll } from "./supabase"
import type { TagCount, TagPair } from "@/components/TagMap"

// Lazy-regenerated on visit. Zero traffic = zero Supabase queries. Cron
// calls /api/revalidate?tag=genres to push a new version when new data
// is ingested upstream.
export async function fetchTagMap(category: "genre" | "theme"): Promise<{ counts: TagCount[]; pairs: TagPair[] }> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")

  const [countsRes, pairs] = await Promise.all([
    supabase.rpc("tag_counts", { p_category: category }).order("n", { ascending: false }),
    paginateAll<{ tag_a: string; tag_b: string; n: number | string }>(
      async (from, to) => {
        const { data, error } = await supabase
          .rpc("tag_pairs", { p_category: category })
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

  const counts: TagCount[] = (countsRes.data ?? []).map(
    (r: { name: string; n: number | string }) => ({ name: r.name, n: Number(r.n) }),
  )
  return { counts, pairs }
}
