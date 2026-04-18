import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

export async function GET() {
  const start = Date.now()
  const { error } = await supabase
    .from("albums")
    .select("id", { count: "exact", head: true })
    .limit(1)
  const latencyMs = Date.now() - start

  if (error) {
    logger.error({ err: error.message, latencyMs }, "health check failed")
    return Response.json(
      { status: "down", latencyMs, error: error.message },
      { status: 503 },
    )
  }

  return Response.json(
    { status: "ok", latencyMs },
    { headers: { "Cache-Control": "no-store" } },
  )
}
