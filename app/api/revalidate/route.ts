import { type NextRequest } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"

// Surgical cache invalidation. Cron (or another trusted upstream) calls:
//   GET /api/revalidate?tag=genres
//   GET /api/revalidate?tag=stats
// When no tag is provided the whole layout tree is revalidated (legacy
// behaviour, still useful for ad-hoc flushes).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
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
