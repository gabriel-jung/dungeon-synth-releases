import { cacheLife, cacheTag } from "next/cache"
import { supabase } from "./supabase"
import type { TagCount, TagPair } from "@/lib/tagGraphLogic"

// `p_top_k = null` on the tag_pairs self-join blows Supabase's 8s
// statement timeout, so we always pass a finite K. For per-category
// graphs (`genre`, `theme`) K = the actual tag count in the category, so
// every tag in the category is eligible without the slow null-K plan. For
// `all` (no category filter) K is hard-capped — `ALL_TOP_K` keeps the
// pair-join bounded at C(K,2) and the layout legible.

export type GraphCategory = "genre" | "theme" | "all"

// Tag pairs is a self-join over the top-K tag set; cost ~ C(K, 2). The
// unfiltered (`p_category = null`) plan touches the full album_tags
// table with no category constraint, so K must stay under the 8s
// Supabase statement timeout. 500 is the empirical ceiling on the
// current corpus; bump cautiously if the prerender ever fails again.
const ALL_TOP_K = 500

export async function fetchTagGraph(
  category: GraphCategory,
): Promise<{ counts: TagCount[]; pairs: TagPair[]; totalAlbums: number }> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  cacheTag(`tag-graph-${category}`)

  const countQuery = supabase.from("tags").select("*", { count: "exact", head: true })
  const countRes = category === "all" ? await countQuery : await countQuery.eq("category", category)
  if (countRes.error) throw new Error(`tags count failed: ${countRes.error.message}`)
  const totalTags = countRes.count ?? 0
  const topK = category === "all" ? Math.min(totalTags, ALL_TOP_K) : totalTags
  const rpcCategory = category === "all" ? null : category

  const [countsRes, pairsRes, albumsRes] = await Promise.all([
    supabase.rpc("tag_counts", { p_category: rpcCategory, p_top_k: topK }),
    supabase.rpc("tag_pairs", { p_category: rpcCategory, p_top_k: topK }),
    // True corpus size for PMI's N. Head-only count, paid once per
    // revalidation like the rest of this block.
    supabase.from("albums").select("*", { count: "exact", head: true }),
  ])
  if (countsRes.error) throw new Error(`tag_counts RPC failed: ${countsRes.error.message}`)
  if (pairsRes.error) throw new Error(`tag_pairs RPC failed: ${pairsRes.error.message}`)
  if (albumsRes.error) throw new Error(`albums count failed: ${albumsRes.error.message}`)

  const countsRaw = (countsRes.data ?? []) as Array<{ name: string; n: number | string }>
  const pairsRaw = (pairsRes.data ?? []) as Array<{ tag_a: string; tag_b: string; n: number | string }>

  const counts: TagCount[] = countsRaw.map((r) => ({ name: r.name, n: Number(r.n) }))
  const pairs: TagPair[] = pairsRaw.map((r) => ({ a: r.tag_a, b: r.tag_b, n: Number(r.n) }))

  return { counts, pairs, totalAlbums: albumsRes.count ?? 0 }
}
