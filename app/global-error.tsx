"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1a1410",
          color: "#f0e6d6",
          fontFamily: "Georgia, serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", color: "#a63d2f", marginBottom: "1.5rem" }}>⚰</div>
          <h1
            style={{
              fontSize: "1.25rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              margin: "0 0 1rem",
            }}
          >
            The archive is silent
          </h1>
          <p style={{ color: "#8a7e6e", fontStyle: "italic", margin: "0 0 2rem" }}>
            {error.message || "An unexpected error disturbed the archives."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#a63d2f",
              border: "1px solid #3d3228",
              padding: "0.5rem 1.5rem",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
