import { cacheLife, cacheTag } from "next/cache"
import { supabase } from "./supabase"
import type { TagCount } from "./types"

export type TagContext = {
  category: "genre" | "theme" | null
  total: number
  genres: TagCount[]
  themes: TagCount[]
}

// Top co-occurring genres and themes for the intersection of the given tags,
// optionally narrowed further by exclude tags. Total = album count at that
// full intersection — matches what the modal's filter chips already apply to
// the release list, so bar percentages line up with what the user sees.
export async function fetchTagContext(
  tags: string[],
  excludeTags: string[] = [],
): Promise<TagContext> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")

  if (tags.length === 0) {
    return { category: null, total: 0, genres: [], themes: [] }
  }

  const [genreRes, themeRes] = await Promise.all([
    supabase.rpc("tag_counts_by_category", {
      p_category: "genre",
      p_year: null,
      p_include_tags: tags,
      p_exclude_tags: excludeTags,
    }),
    supabase.rpc("tag_counts_by_category", {
      p_category: "theme",
      p_year: null,
      p_include_tags: tags,
      p_exclude_tags: excludeTags,
    }),
  ])
  if (genreRes.error) throw new Error(`tag_counts_by_category(genre) RPC failed: ${genreRes.error.message}`)
  if (themeRes.error) throw new Error(`tag_counts_by_category(theme) RPC failed: ${themeRes.error.message}`)

  type Row = { name: string; n: number | string }
  const rawGenres = (genreRes.data ?? []) as Row[]
  const rawThemes = (themeRes.data ?? []) as Row[]

  // Infer category from which RPC surfaces the primary tag (tags[0]). The
  // matching self-row's n is the intersection's album count — more reliable
  // than a tags-table lookup when a name appears in multiple categories.
  const primary = tags[0]
  const selfGenre = rawGenres.find((r) => r.name === primary)
  const selfTheme = rawThemes.find((r) => r.name === primary)
  const category: "genre" | "theme" | null =
    selfGenre ? "genre" : selfTheme ? "theme" : null
  const total = Number(selfGenre?.n ?? selfTheme?.n ?? 0)

  const tagSet = new Set(tags)
  const toCounts = (rows: Row[]): TagCount[] =>
    rows.map((r) => ({ name: r.name, n: Number(r.n) })).filter((r) => !tagSet.has(r.name))

  return {
    category,
    total,
    genres: toCounts(rawGenres),
    themes: toCounts(rawThemes),
  }
}
