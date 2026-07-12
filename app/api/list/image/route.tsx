import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { type NextRequest } from "next/server"
import { decodeState, chartCapacity, measureChart, chartTile, chartEdge, aspectCanvas, autoCanvas, fitBox, isHexColor, isHorizontalText, resolveBg, chartInk, titleFontSize, frameBorder, captionFields, NUMBER_BADGE, ART_BACKDROP } from "@/lib/listCodec"
import { fetchAlbumsByIds } from "@/lib/supabase"
import { coverUrl, type AlbumListItem } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

// The font bytes never change; load them once per instance instead of five
// disk reads on every render.
const fontsPromise = Promise.all([
  readFile(path.join(process.cwd(), "public/fonts/Cinzel-Regular.woff")),
  readFile(path.join(process.cwd(), "public/fonts/Cinzel-Bold.woff")),
  readFile(path.join(process.cwd(), "public/fonts/CrimsonText-Regular.ttf")),
  readFile(path.join(process.cwd(), "public/fonts/CrimsonText-SemiBold.ttf")),
  readFile(path.join(process.cwd(), "public/fonts/CrimsonText-Italic.ttf")),
])

// Renders the list as a downloadable PNG. The shape sets a fixed canvas; covers
// auto-fit to fill it (coverSize shrinks them). Layout comes from the shared
// measureChart so the PNG matches the in-app preview. Satori is a flexbox subset.
export async function GET(request: NextRequest) {
  // 60/min: album unfurls point og:image here, so one crawler IP resolving a
  // burst of fresh links must not starve real downloads (CDN caching absorbs
  // repeats, but every distinct album is a new URL).
  const rl = checkRateLimit(`list-img:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const state = await decodeState(request.nextUrl.searchParams.get("d"))

  // Pages, numbering, and caption-override indices are all based on
  // state.items (exactly like the preview), NOT on which ids still resolve:
  // a deleted album keeps its slot as a placeholder tile instead of shifting
  // every caption/number after it. Only the page's own ids are fetched.
  const cap = chartCapacity(state)
  const totalPages = Math.max(1, Math.ceil(state.items.length / cap))
  const pageParam = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)
  const pageIdx = Math.min(Math.max(Number.isFinite(pageParam) ? pageParam : 1, 1), totalPages) - 1
  const OFFSET = pageIdx * cap
  const pageIds = state.items.slice(OFFSET, OFFSET + cap)
  // A transient DB failure degrades to an all-placeholder chart instead of a
  // 500 (this URL is also every unfurl's og:image).
  const fetched = await fetchAlbumsByIds(pageIds).catch(() => [] as AlbumListItem[])
  const byId = new Map(fetched.map((a) => [a.id, a]))
  const items = pageIds.map((id) => byId.get(id) ?? null)

  // The "theme" backdrop is a CSS var in the preview; the client passes the
  // resolved hex along (?bg=) so the PNG matches what the user saw. Only
  // honoured for the theme preset; explicit backdrops already are concrete.
  const bgParam = request.nextUrl.searchParams.get("bg")
  const bgKey = state.bg === "theme" && bgParam && isHexColor(bgParam) ? bgParam : state.bg
  const bg = resolveBg(bgKey, "#1a1410")
  const ink = chartInk(bgKey, "#f0e6d6", "#8a7e6e")

  // Fixed shapes lay out at full capacity (the chosen cols×rows ARE the
  // chart's dimensions); "auto" hugs the covers this page actually has.
  // Matches the preview exactly.
  const layoutCount = state.aspect === "auto" ? Math.max(1, items.length) : cap
  // "auto" hugs the content; fixed shapes fit the content into the frame.
  const ac = state.aspect === "auto" ? autoCanvas(state, layoutCount) : null
  const { w: W, h: H } = ac ?? aspectCanvas(state.aspect)
  const centered = state.anchor === "center"
  // Stories overlay UI top and bottom; fit the content into the safe band.
  const box = fitBox(state.aspect, W, H)
  const TILE = ac ? ac.tile : chartTile(state, layoutCount, box.w, box.h)
  // Outer margin = the inter-cover gap (0 = flush to the corner).
  const PAD = chartEdge(state, TILE)
  const L = measureChart(state, layoutCount, TILE, W - 2 * PAD)
  const horiz = isHorizontalText(state.textPos)
  const wrapText = state.wrap
  const ai = state.textAlign === "center" ? "center" : state.textAlign === "right" ? "flex-end" : "flex-start"

  const titleFs = titleFontSize(TILE, L.contentW, state.title)
  const crestFs = Math.round(TILE * 0.08)
  const creditFs = Math.round(TILE * 0.05)

  // "art" backdrop: the page's first cover full-bleed under a dark gradient
  // (Satori has no blur; a dimmed 700px source stretched to canvas reads soft
  // enough). Covers then get a shadow so they lift off the busy backdrop.
  const artBgSrc = state.bg === "art" ? coverUrl(items[0]?.art_id, "xl") : null
  const coverShadow = state.bg === "art" ? ART_BACKDROP.coverShadow : undefined
  const bw = frameBorder(TILE, state.frameWidth)

  // Cinzel for the title/wordmark (display), Crimson Text for captions: the
  // same split the site itself uses, so the export matches the preview's
  // body-font captions instead of forcing everything into the display face.
  const [cinzelRegular, cinzelBold, crimsonRegular, crimsonSemiBold, crimsonItalic] = await fontsPromise

  const oneLine = (fs: number, color: string, weight: number, text: string, maxW: number, italic = false) => (
    <div
      style={{
        display: "flex",
        fontFamily: "Crimson Text",
        fontSize: fs,
        lineHeight: 1.3,
        fontWeight: weight,
        fontStyle: italic ? "italic" : "normal",
        color,
        maxWidth: maxW,
        // Wrapped lines need the explicit alignment; the flex wrapper only
        // places the block, not the text inside it.
        textAlign: state.textAlign as "left" | "center" | "right",
        whiteSpace: wrapText ? "normal" : "nowrap",
        overflow: "hidden",
        textOverflow: wrapText ? "clip" : "ellipsis",
      }}
    >
      {text}
    </div>
  )

  // Caption tiers: title semibold bright / artist dim italic / meta dim
  // regular. Which lines exist and where the rank number goes comes from the
  // shared captionFields, so it cannot drift from the preview.
  const captionBlock = (a: AlbumListItem | null, capW: number, idx: number, withNum: boolean) => {
    if (!a || L.capH <= 0) return null
    const fields = captionFields(state, a, state.texts[OFFSET + idx], withNum ? OFFSET + idx + 1 : null)
    if (fields.length === 0) return null
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: ai, justifyContent: "center", width: capW }}>
        {fields.map((f, i) => (
          <div key={i} style={{ display: "flex", width: capW, justifyContent: ai === "flex-end" ? "flex-end" : ai === "center" ? "center" : "flex-start" }}>
            {oneLine(f.bright ? L.capTitleFs : L.capSubFs, f.bright ? ink.fg : ink.dim, f.bright ? 600 : 400, f.text, capW, f.italic)}
          </div>
        ))}
      </div>
    )
  }

  // An unresolved id (album deleted upstream) keeps its slot as a bare dark
  // tile, mirroring the preview's placeholder, so nothing after it shifts.
  const cover = (a: AlbumListItem | null, idx: number, showNum: boolean) => {
    const src = a ? coverUrl(a.art_id, "xl") : null
    return (
      // Satori rejects an explicit `boxShadow: undefined`, so spread only when set.
      <div style={{ display: "flex", position: "relative", overflow: "hidden", width: TILE, height: TILE, backgroundColor: "#00000055", ...(coverShadow ? { boxShadow: coverShadow } : {}), ...(bw > 0 ? { border: `${bw}px solid ${ink.dim}` } : {}) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" width={TILE} height={TILE} style={{ objectFit: "cover" }} /> : null}
        {showNum && state.numbered ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: Math.round(TILE * NUMBER_BADGE.band),
              paddingLeft: Math.round(TILE * NUMBER_BADGE.padLeft),
              paddingBottom: Math.round(TILE * NUMBER_BADGE.padBottom),
              backgroundImage: NUMBER_BADGE.gradient,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Cinzel",
                fontSize: Math.round(TILE * NUMBER_BADGE.fontSize),
                fontWeight: 700,
                lineHeight: 1,
                color: NUMBER_BADGE.ink,
                textShadow: NUMBER_BADGE.textShadow,
              }}
            >
              {OFFSET + idx + 1}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // Vertical text (top/bottom): caption under or over each cover, in the grid.
  const vCell = (a: AlbumListItem | null, idx: number) => {
    const cap = captionBlock(a, TILE, idx, false)
    const before = state.textPos === "top"
    return (
      <div key={a?.id ?? `slot-${OFFSET + idx}`} style={{ display: "flex", flexDirection: "column", alignItems: ai, gap: Math.round(TILE * 0.045), width: TILE }}>
        {before ? cap : null}
        {cover(a, idx, true)}
        {before ? null : cap}
      </div>
    )
  }

  const coverGrid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: L.gap, width: L.gridW }}>
      {items.map((a, idx) => (
        <div key={a?.id ?? `slot-${OFFSET + idx}`} style={{ display: "flex", width: TILE, height: L.cellH, alignItems: "center" }}>{cover(a, idx, true)}</div>
      ))}
    </div>
  )

  // Side text: one numbered list column beside the grid, rows aligned to grid rows.
  const textList = (
    <div style={{ display: "flex", flexDirection: "column", gap: L.gap, width: L.textColW }}>
      {Array.from({ length: L.rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: L.cellH, gap: Math.round(TILE * 0.04) }}>
          {items.slice(r * L.cols, r * L.cols + L.cols).map((a, i) => (
            <div key={a?.id ?? `slot-${OFFSET + r * L.cols + i}`} style={{ display: "flex" }}>{captionBlock(a, L.textColW, r * L.cols + i, true)}</div>
          ))}
        </div>
      ))}
    </div>
  )

  const sideText = horiz && L.capH > 0

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: centered ? "center" : "flex-start",
          justifyContent: centered ? "center" : "flex-start",
          padding: centered ? 0 : PAD,
          backgroundColor: bg,
          fontFamily: "Cinzel",
        }}
      >
        {artBgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artBgSrc}
            alt=""
            width={W}
            height={H}
            style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", opacity: ART_BACKDROP.opacity }}
          />
        ) : null}
        {artBgSrc ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: H,
              backgroundImage: ART_BACKDROP.gradient,
            }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", width: L.contentW }}>
          {state.title.trim() ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", marginBottom: Math.round(TILE * 0.12) }}>
              <div
                style={{
                  display: "flex",
                  width: Math.round(crestFs * 0.5),
                  height: Math.round(crestFs * 0.5),
                  border: `2px solid ${ink.dim}`,
                  transform: "rotate(45deg)",
                  marginBottom: Math.round(TILE * 0.06),
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: titleFs,
                  fontWeight: 700,
                  letterSpacing: Math.round(titleFs * 0.07),
                  textTransform: "uppercase",
                  color: ink.fg,
                  textAlign: "center",
                  maxWidth: L.contentW,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {state.title}
              </div>
              <div style={{ display: "flex", width: Math.round(TILE * 0.6), height: 1, backgroundColor: ink.dim, marginTop: Math.round(TILE * 0.07) }} />
            </div>
          ) : null}

          {sideText ? (
            <div style={{ display: "flex", flexDirection: "row", gap: L.gap, width: L.contentW }}>
              {state.textPos === "left" ? textList : null}
              {coverGrid}
              {state.textPos === "right" ? textList : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: L.gap, width: L.gridW }}>
              {items.map((a, idx) => vCell(a, idx))}
            </div>
          )}

          {state.footer ? (
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(TILE * 0.045), marginTop: Math.round(TILE * 0.14) }}>
              <div
                style={{
                  display: "flex",
                  width: Math.round(TILE * 0.028),
                  height: Math.round(TILE * 0.028),
                  border: `1px solid ${ink.dim}`,
                  transform: "rotate(45deg)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: creditFs,
                  letterSpacing: Math.round(creditFs * 0.25),
                  textTransform: "uppercase",
                  color: ink.dim,
                }}
              >
                Dungeon Synth Releases
              </div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Cinzel", data: cinzelRegular, weight: 400, style: "normal" },
        { name: "Cinzel", data: cinzelBold, weight: 700, style: "normal" },
        { name: "Crimson Text", data: crimsonRegular, weight: 400, style: "normal" },
        { name: "Crimson Text", data: crimsonSemiBold, weight: 600, style: "normal" },
        { name: "Crimson Text", data: crimsonItalic, weight: 400, style: "italic" },
      ],
      headers: {
        "Content-Disposition": `attachment; filename="dungeon-synth-list${totalPages > 1 ? `-p${pageIdx + 1}` : ""}.png"`,
        // `d` fully determines the layout; only the album rows behind the ids
        // can drift, so a day of caching is safe and keeps unfurl crawlers and
        // re-downloads off Satori.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  )
}
