import { cacheLife, cacheTag } from "next/cache"
import { supabase } from "./supabase"
import type { TagCount, TagPair } from "@/lib/tagGraphLogic"

// Server-side cap on tags included in the graph. Both counts and pairs are
// restricted to the top K tags by count, so pair payload is bounded by
// C(K,2) and the self-join in `tag_pairs` stays small. Hard cap of 300
// keeps the SQL self-join under Supabase's 8s statement timeout, going
// unbounded blew the build prerender on /graphs/genres at corpus scale.
export const TAG_GRAPH_TOP_K: number | null = 300

// Lazy-regenerated on visit. Zero traffic = zero Supabase queries. Cron
// calls /api/revalidate?tag=genres to push a new version when new data
// is ingested upstream.
//
// Both RPCs return a single jsonb row, so one HTTP call fetches the full
// result, PostgREST's 1000-row cap does not bound pagination.
export async function fetchTagGraph(
  category: "genre" | "theme",
  topK: number | null = TAG_GRAPH_TOP_K,
): Promise<{ counts: TagCount[]; pairs: TagPair[] }> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  cacheTag(`tag-graph-${category}`)

  const [countsRes, pairsRes] = await Promise.all([
    supabase.rpc("tag_counts", { p_category: category, p_top_k: topK }),
    supabase.rpc("tag_pairs", { p_category: category, p_top_k: topK }),
  ])
  if (countsRes.error) throw new Error(`tag_counts RPC failed: ${countsRes.error.message}`)
  if (pairsRes.error) throw new Error(`tag_pairs RPC failed: ${pairsRes.error.message}`)

  const countsRaw = (countsRes.data ?? []) as Array<{ name: string; n: number | string }>
  const pairsRaw = (pairsRes.data ?? []) as Array<{ tag_a: string; tag_b: string; n: number | string }>

  const counts: TagCount[] = countsRaw.map((r) => ({ name: r.name, n: Number(r.n) }))
  const pairs: TagPair[] = pairsRaw.map((r) => ({ a: r.tag_a, b: r.tag_b, n: Number(r.n) }))

  return { counts, pairs }
}
