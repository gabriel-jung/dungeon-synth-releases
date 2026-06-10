import { type NextRequest } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { timingSafeEqual } from "node:crypto"

// Constant-time bearer-token check. Returns false on any length mismatch
// before the timing-safe compare (timingSafeEqual throws on unequal lengths).
function authorized(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header ?? "")
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Surgical cache invalidation. Cron (or another trusted upstream) calls:
//   GET /api/revalidate?tag=genres
//   GET /api/revalidate?tag=stats
// When no tag is provided the whole layout tree is revalidated (legacy
// behaviour, still useful for ad-hoc flushes).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret || !authorized(auth, secret)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const tag = request.nextUrl.searchParams.get("tag")
  if (tag) {
    revalidateTag(tag, "days")
    return Response.json({ revalidated: true, tag, at: new Date().toISOString() })
  }

  revalidatePath("/", "layout")
  return Response.json({ revalidated: true, scope: "layout", at: new Date().toISOString() })
}
