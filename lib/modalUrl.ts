// URL-driven modal state. Single source of truth for which modal is open.
//
// Kinds:
// - "album"    — ?album=<id>          detail modal, overlays everything
// - "artist"   — ?artist=<name>       scoper modal
// - "host"     — ?host=<id>           scoper modal
// - "genre"    — ?genre=<name>        scoper modal (may repeat for intersection)
// - "xgenre"   — ?xgenre=<name>       banned inside scoper (may repeat)
// - "upcoming" — ?upcoming=1          upcoming-releases modal
// - "day"      — ?day=<YYYY-MM-DD>    day-list modal (from calendar heatmap)
//
// Page-level filters (?tag=, ?xtag=) are NOT modal state and are handled
// separately by TagFilter / FilterChips.

export type ModalKind = "album" | "artist" | "host" | "genre" | "xgenre" | "upcoming" | "day"

const SINGLE_KINDS: ModalKind[] = ["album", "artist", "host", "upcoming", "day"]
const MULTI_KINDS: ModalKind[] = ["genre", "xgenre"]

export interface ModalState {
  album: string | null
  artist: string | null
  host: string | null
  genres: string[]
  xgenres: string[]
  upcoming: boolean
  day: string | null
}

export function readModalState(sp: URLSearchParams): ModalState {
  return {
    album: sp.get("album"),
    artist: sp.get("artist"),
    host: sp.get("host"),
    genres: sp.getAll("genre"),
    xgenres: sp.getAll("xgenre"),
    upcoming: sp.get("upcoming") === "1",
    day: sp.get("day"),
  }
}

// Returns a new URLSearchParams with the modal param set.
// For single-valued kinds, replaces the existing value.
// For multi-valued kinds (genre, xgenre), appends without duplicating.
export function openModal(sp: URLSearchParams, kind: ModalKind, value: string | number | boolean = true): URLSearchParams {
  const next = new URLSearchParams(sp.toString())
  if (SINGLE_KINDS.includes(kind)) {
    if (kind === "upcoming") {
      if (value) next.set("upcoming", "1")
      else next.delete("upcoming")
    } else if (typeof value === "string" || typeof value === "number") {
      next.set(kind, String(value))
    }
  } else if (MULTI_KINDS.includes(kind) && (typeof value === "string" || typeof value === "number")) {
    const v = String(value)
    const existing = next.getAll(kind)
    if (!existing.includes(v)) next.append(kind, v)
  }
  return next
}

// Removes a modal param. For multi-valued kinds, removes a single instance
// when `value` is given; omitting `value` clears all instances of that kind.
export function closeModal(sp: URLSearchParams, kind: ModalKind, value?: string): URLSearchParams {
  const next = new URLSearchParams(sp.toString())
  if (SINGLE_KINDS.includes(kind)) {
    next.delete(kind)
  } else if (MULTI_KINDS.includes(kind)) {
    if (value === undefined) {
      next.delete(kind)
    } else {
      const remaining = next.getAll(kind).filter((v) => v !== value)
      next.delete(kind)
      for (const v of remaining) next.append(kind, v)
    }
  }
  return next
}

// Produces a query string (with leading "?") or empty string.
export function toQueryString(sp: URLSearchParams): string {
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

// Push a URL change that only toggles modal state (?album=, ?genre=, etc.).
// Skips Next.js routing entirely: no RSC refetch, no re-render of the server
// page. Listeners use `useModalSearchParams` to react to the emitted event.
export const MODAL_URL_EVENT = "modal-url-change"
export function pushModalUrl(url: string): void {
  if (typeof window === "undefined") return
  window.history.pushState(null, "", url)
  window.dispatchEvent(new Event(MODAL_URL_EVENT))
}

// Convenience: build an href that opens the given modal, preserving current
// page-level filters (tag, xtag) and other modal params.
export function hrefWithModal(
  currentSp: URLSearchParams,
  kind: ModalKind,
  value: string | number | boolean = true,
  pathname = "",
): string {
  const next = openModal(currentSp, kind, value)
  return `${pathname}${toQueryString(next)}`
}
