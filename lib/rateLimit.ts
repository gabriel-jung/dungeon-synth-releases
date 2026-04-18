import { type NextRequest } from "next/server"

// In-memory sliding-window limiter. Per-instance only — on Vercel each
// serverless instance has its own Map, so this stops casual abuse but
// not distributed attacks.
const hits = new Map<string, number[]>()

const GC_THRESHOLD = 500

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number }

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  const arr = hits.get(key) ?? []
  const fresh = arr.length && arr[0] <= cutoff ? arr.filter((t) => t > cutoff) : arr

  if (fresh.length >= max) {
    hits.set(key, fresh)
    const retryAfter = Math.max(1, Math.ceil((fresh[0] + windowMs - now) / 1000))
    return { ok: false, retryAfter }
  }

  fresh.push(now)
  hits.set(key, fresh)

  if (hits.size > GC_THRESHOLD) {
    setImmediate(() => {
      const gcCutoff = Date.now() - windowMs
      for (const [k, v] of hits) {
        const f = v.filter((t) => t > gcCutoff)
        if (f.length === 0) hits.delete(k)
        else hits.set(k, f)
      }
    })
  }

  return { ok: true, remaining: max - fresh.length }
}

export function ipFromRequest(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}

export function rateLimitResponse(retryAfter: number): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: { "Retry-After": String(retryAfter) },
  })
}
