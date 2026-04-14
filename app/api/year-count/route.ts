import { type NextRequest } from "next/server"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const year = Number(sp.get("year")) || new Date().getUTCFullYear()
  const includeTags = sp.getAll("tag")
  const excludeTags = sp.getAll("xtag")

  const { data } = await supabase.rpc("daily_counts", {
    p_year: year,
    p_include_tags: includeTags,
    p_exclude_tags: excludeTags,
  })

  const today = localDateStr(new Date())
  const total = (data ?? []).reduce(
    (sum: number, r: { date: string; n: number | string }) =>
      r.date <= today ? sum + Number(r.n) : sum,
    0,
  )

  return Response.json({ count: total })
}
