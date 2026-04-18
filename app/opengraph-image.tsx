import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const alt = "Dungeon Synth Releases — a chronicle of releases from Bandcamp"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  const [cinzelRegular, cinzelBold] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/Cinzel-Regular.woff")),
    readFile(path.join(process.cwd(), "public/fonts/Cinzel-Bold.woff")),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1a1410",
          backgroundImage:
            "radial-gradient(ellipse at top, #2a2319 0%, #1a1410 60%)",
          color: "#f0e6d6",
          fontFamily: "Cinzel",
          padding: "60px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 30,
            right: 30,
            bottom: 30,
            left: 30,
            border: "2px solid #5a4a3a",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 40,
            bottom: 40,
            left: 40,
            border: "1px solid #3d3228",
            display: "flex",
          }}
        />
        <div
          style={{
            marginBottom: 30,
            display: "flex",
            gap: 20,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: "#a63d2f", display: "flex" }} />
          <div style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: "#a63d2f", display: "flex" }} />
          <div style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: "#a63d2f", display: "flex" }} />
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#a63d2f",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Dungeon Synth
        </div>
        <div
          style={{
            fontSize: 20,
            letterSpacing: 6,
            color: "#8a7e6e",
            textTransform: "uppercase",
            marginTop: 24,
          }}
        >
          — Releases from Bandcamp —
        </div>
        <div
          style={{
            marginTop: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 1,
              backgroundImage:
                "linear-gradient(to right, #a63d2f 0%, #3d3228 30%, #3d3228 70%, #a63d2f 100%)",
              display: "flex",
            }}
          />
          <div
            style={{
              width: 14,
              height: 14,
              border: "1.5px solid #a63d2f",
              backgroundColor: "#1a1410",
              transform: "rotate(45deg)",
              display: "flex",
            }}
          />
        </div>

      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cinzel", data: cinzelRegular, weight: 400, style: "normal" },
        { name: "Cinzel", data: cinzelBold, weight: 700, style: "normal" },
      ],
    },
  )
}
