"use server"

import { updateTag } from "next/cache"
import { STATS_CHUNK_TAGS, type StatsChunkTag } from "@/lib/stats"

const ALLOWED = new Set<StatsChunkTag>(STATS_CHUNK_TAGS)

// Server Action: invalidate one stats chunk's cache entry and trigger an
// immediate refetch. updateTag gives read-your-writes semantics: the RSC
// re-render kicked off by the form post sees fresh data, not stale.
// revalidateTag would only mark stale for *future* requests, which is wrong
// for a retry button where the user expects the chunk to swap in now.
//
// Restricted to a known set so untrusted clients can't flush arbitrary tags
// via the form post.
export async function retryStatsChunk(tag: string) {
  if (!ALLOWED.has(tag as StatsChunkTag)) return
  updateTag(tag)
}
