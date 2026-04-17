import { type NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")

  if (!url) {
    return new Response("Missing url parameter", { status: 400 })
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

  const upstream = await fetch(url)

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
