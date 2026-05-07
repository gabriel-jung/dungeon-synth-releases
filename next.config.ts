import type { NextConfig } from "next"

const csp = [
  "default-src 'self'",
  // Next.js ships inline bootstrapping scripts; 'unsafe-eval' covers edge cases
  // in production bundles. Tighten with nonces later if/when we audit inline JS.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.bcbits.com https://*.bandcamp.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.31"],
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  async redirects() {
    return [
      { source: "/past", destination: "/", permanent: true },
      { source: "/past/:year", destination: "/releases/:year", permanent: true },
      { source: "/upcoming", destination: "/?upcoming=1", permanent: true },
      { source: "/genres", destination: "/graphs/genres", permanent: true },
      { source: "/themes", destination: "/graphs/themes", permanent: true },
      { source: "/stats", destination: "/statistics", permanent: true },
      { source: "/stats/:path*", destination: "/statistics/:path*", permanent: true },
    ]
  },
}

export default nextConfig
