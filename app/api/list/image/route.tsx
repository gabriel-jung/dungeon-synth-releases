import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { type NextRequest } from "next/server"
import { decodeState, chartIds, chartCapacity, measureChart, chartTile, chartEdge, aspectCanvas, autoCanvas, isHorizontalText, resolveBg, chartInk, titleFontSize } from "@/lib/listCodec"
import { fetchAlbumsByIds } from "@/lib/supabase"
import { coverUrl, formatDateShort, isHostedRelease, type AlbumListItem } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

// Renders the list as a downloadable PNG. The shape sets a fixed canvas; covers
// auto-fit to fill it (coverSize shrinks them). Layout comes from the shared
// measureChart so the PNG matches the in-app preview. Satori is a flexbox subset.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`list-img:${ipFromRequest(request)}`, 20, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const state = await decodeState(request.nextUrl.searchParams.get("d"))
  const albums = await fetchAlbumsByIds(chartIds(state))
  const byId = new Map(albums.map((a) => [a.id, a]))
  const all = state.items.map((id) => byId.get(id)).filter((a): a is AlbumListItem => a != null)

  // Charts larger than cols×rows export one image per page (?page=, 1-based);
  // numbering continues across pages (OFFSET).
  const cap = chartCapacity(state)
  const totalPages = Math.max(1, Math.ceil(all.length / cap))
  const pageParam = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)
  const pageIdx = Math.min(Math.max(Number.isFinite(pageParam) ? pageParam : 1, 1), totalPages) - 1
  const OFFSET = pageIdx * cap
  const items = all.slice(OFFSET, OFFSET + cap)

  // The "theme" backdrop is a CSS var in the preview; the client passes the
  // resolved hex along (?bg=) so the PNG matches what the user saw. Only
  // honoured for the theme preset; explicit backdrops already are concrete.
  const bgParam = request.nextUrl.searchParams.get("bg")
  const bgKey =
    state.bg === "theme" && bgParam && /^#[0-9a-fA-F]{6}$/.test(bgParam) ? bgParam : state.bg
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
  const TILE = ac ? ac.tile : chartTile(state, layoutCount, W, H)
  // Outer margin = the inter-cover gap (0 = flush to the corner).
  const PAD = chartEdge(state, TILE)
  const L = measureChart(state, layoutCount, TILE, W - 2 * PAD)
  const horiz = isHorizontalText(state.textPos)
  const wrapText = state.wrap
  const ai = state.textAlign === "center" ? "center" : state.textAlign === "right" ? "flex-end" : "flex-start"

  const titleFs = titleFontSize(TILE, L.contentW, state.title)
  const crestFs = Math.round(TILE * 0.08)
  const creditFs = Math.round(TILE * 0.05)

  const [cinzelRegular, cinzelBold] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/Cinzel-Regular.woff")),
    readFile(path.join(process.cwd(), "public/fonts/Cinzel-Bold.woff")),
  ])

  const oneLine = (fs: number, color: string, weight: number, text: string, maxW: number) => (
    <div
      style={{
        display: "flex",
        fontSize: fs,
        lineHeight: 1.3,
        fontWeight: weight,
        color,
        maxWidth: maxW,
        whiteSpace: wrapText ? "normal" : "nowrap",
        overflow: "hidden",
        textOverflow: wrapText ? "clip" : "ellipsis",
      }}
    >
      {text}
    </div>
  )

  const captionBlock = (a: AlbumListItem, capW: number, idx: number, withNum: boolean) => {
    if (L.capH <= 0) return null
    const fields: Array<{ fs: number; c: string; w: number; t: string }> = []
    if (state.showTitle) fields.push({ fs: L.capTitleFs, c: ink.fg, w: 700, t: a.title })
    if (state.showArtist) fields.push({ fs: L.capSubFs, c: ink.dim, w: 400, t: a.artist })
    // Skip the label line entirely for self-released albums, matching the
    // preview (an empty line here would push captions out of sync with it).
    if (state.showLabel && isHostedRelease(a)) fields.push({ fs: L.capSubFs, c: ink.dim, w: 400, t: a.host_name! })
    if (state.showDate) fields.push({ fs: L.capSubFs, c: ink.dim, w: 400, t: a.date ? formatDateShort(a.date, true) : "" })
    if (fields.length === 0) return null
    if (withNum && state.numberText) fields[0] = { ...fields[0], t: `${OFFSET + idx + 1}. ${fields[0].t}` }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: ai, justifyContent: "center", width: capW }}>
        {fields.map((f, i) => (
          <div key={i} style={{ display: "flex", width: capW, justifyContent: ai === "flex-end" ? "flex-end" : ai === "center" ? "center" : "flex-start" }}>
            {oneLine(f.fs, f.c, f.w, f.t, capW)}
          </div>
        ))}
      </div>
    )
  }

  const cover = (a: AlbumListItem, idx: number, showNum: boolean) => {
    const src = coverUrl(a.art_id, "xl")
    return (
      <div style={{ display: "flex", position: "relative", width: TILE, height: TILE, backgroundColor: "#00000055" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" width={TILE} height={TILE} style={{ objectFit: "cover" }} /> : null}
        {showNum && state.numbered ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              padding: `${Math.round(TILE * 0.01)}px ${Math.round(TILE * 0.04)}px`,
              fontSize: Math.round(TILE * 0.09),
              fontWeight: 700,
              color: "#fff",
              backgroundColor: "#000000b0",
            }}
          >
            {OFFSET + idx + 1}
          </div>
        ) : null}
      </div>
    )
  }

  // Vertical text (top/bottom): caption under or over each cover, in the grid.
  const vCell = (a: AlbumListItem, idx: number) => {
    const cap = captionBlock(a, TILE, idx, false)
    const before = state.textPos === "top"
    return (
      <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: ai, gap: Math.round(TILE * 0.045), width: TILE }}>
        {before ? cap : null}
        {cover(a, idx, true)}
        {before ? null : cap}
      </div>
    )
  }

  const coverGrid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: L.gap, width: L.gridW }}>
      {items.map((a, idx) => (
        <div key={a.id} style={{ display: "flex", width: TILE, height: L.cellH, alignItems: "center" }}>{cover(a, idx, true)}</div>
      ))}
    </div>
  )

  // Side text: one numbered list column beside the grid, rows aligned to grid rows.
  const textList = (
    <div style={{ display: "flex", flexDirection: "column", gap: L.gap, width: L.textColW }}>
      {Array.from({ length: L.rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: L.cellH, gap: Math.round(TILE * 0.04) }}>
          {items.slice(r * L.cols, r * L.cols + L.cols).map((a, i) => (
            <div key={a.id} style={{ display: "flex" }}>{captionBlock(a, L.textColW, r * L.cols + i, true)}</div>
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
            <div
              style={{
                display: "flex",
                marginTop: Math.round(TILE * 0.14),
                fontSize: creditFs,
                letterSpacing: Math.round(creditFs * 0.25),
                textTransform: "uppercase",
                color: ink.dim,
              }}
            >
              Dungeon Synth Releases
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
