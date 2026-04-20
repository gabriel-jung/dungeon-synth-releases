import { cacheLife, cacheTag } from "next/cache"
import { supabase } from "./supabase"
import type { TagCount, TagPair } from "@/components/TagMap"

// Server-side cap on tags included in the map. Both counts and pairs are
// restricted to the top K tags by count, so pair payload is bounded by
// C(K,2) and the self-join in `tag_pairs` stays small. NULL = unbounded.
export const TAG_MAP_TOP_K: number | null = null

// Lazy-regenerated on visit. Zero traffic = zero Supabase queries. Cron
// calls /api/revalidate?tag=genres to push a new version when new data
// is ingested upstream.
//
// Both RPCs return a single jsonb row, so one HTTP call fetches the full
// result — PostgREST's 1000-row cap does not bound pagination.
export async function fetchTagMap(
  category: "genre" | "theme",
  topK: number | null = TAG_MAP_TOP_K,
): Promise<{ counts: TagCount[]; pairs: TagPair[] }> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")

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
