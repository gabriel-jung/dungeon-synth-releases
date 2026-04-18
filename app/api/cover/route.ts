import { type NextRequest } from "next/server"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`cover:${ipFromRequest(request)}`, 300, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const url = request.nextUrl.searchParams.get("url")

  if (!url) {
    return new Response("Missing url parameter", { status: 400 })
  }

  // Reject cross-origin hotlinking — if a Referer is present and doesn't
  // match our host, it's not a legitimate page load from this site.
  // Missing Referer is tolerated (some clients strip it).
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      const refererHost = new URL(referer).hostname
      const ownHost = request.nextUrl.hostname
      if (refererHost !== ownHost && refererHost !== "localhost") {
        return new Response("Forbidden", { status: 403 })
      }
    } catch {
      return new Response("Forbidden", { status: 403 })
    }
  }

  // Only allow Bandcamp image URLs
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith("bcbits.com") && !parsed.hostname.endsWith("bandcamp.com")) {
      return new Response("Only Bandcamp image URLs allowed", { status: 403 })
    }
  } catch {
    return new Response("Invalid URL", { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(8000) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const timeout = err instanceof Error && err.name === "TimeoutError"
    logger.error({ route: "api/cover", url, err: msg, timeout }, "upstream fetch failed")
    return new Response(timeout ? "Upstream timeout" : "Upstream fetch failed", { status: timeout ? 504 : 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Failed to fetch image", { status: upstream.status })
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
  const contentLength = upstream.headers.get("content-length")
  const MAX_BYTES = 5 * 1024 * 1024
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return new Response("Image too large", { status: 413 })
  }

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
  }
  if (contentLength) headers["Content-Length"] = contentLength

  return new Response(upstream.body, { headers })
}
