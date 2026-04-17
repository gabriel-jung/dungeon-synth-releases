import { type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  revalidatePath("/", "layout")

  return Response.json({ revalidated: true, at: new Date().toISOString() })
}
