import { type NextRequest, connection } from "next/server"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

export async function GET(request: NextRequest) {
  // Throttle: the probe is unauthenticated and hits the DB, so cap it like
  // every other route to deny a cheap request-amplification DoS.
  const rl = checkRateLimit(`health:${ipFromRequest(request)}`, 30, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  await connection()
  const start = Date.now()
  // Cheap liveness probe: fetch one id, no exact COUNT (an exact count scans
  // the whole ~40k-row table on the shared vCPU).
  const { error } = await supabase
    .from("albums")
    .select("id")
    .limit(1)
  const latencyMs = Date.now() - start

  if (error) {
    logger.error({ err: error.message, latencyMs }, "health check failed")
    return Response.json(
      { status: "down", latencyMs },
      { status: 503 },
    )
  }

  return Response.json(
    { status: "ok", latencyMs },
    { headers: { "Cache-Control": "no-store" } },
  )
}
