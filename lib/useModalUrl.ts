"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { hrefWithModal, pushModalUrl, MODAL_URL_EVENT, type ModalKind } from "./modalUrl"

const EMPTY = ""

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback)
  window.addEventListener(MODAL_URL_EVENT, callback)
  return () => {
    window.removeEventListener("popstate", callback)
    window.removeEventListener(MODAL_URL_EVENT, callback)
  }
}

function getSnapshot(): string {
  return window.location.search
}

function getServerSnapshot(): string {
  return EMPTY
}

// Client-side URLSearchParams view that reacts to both browser back/forward
// and the custom `modal-url-change` event fired by `pushModalUrl`. Readers
// using this hook stay in sync without pulling the whole page through a
// Next.js RSC fetch on every modal toggle.
export function useModalSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => new URLSearchParams(search), [search])
}

// Returns a stable callback that opens the named modal by pushing the derived
// URL via the history API. Consolidates the read-at-click idiom used by every
// list row, search pick, nav button, and heatmap cell.
export function useOpenModal() {
  const pathname = usePathname()
  return useCallback(
    (kind: ModalKind, value: string | number | boolean = true) => {
      const sp = new URLSearchParams(window.location.search)
      pushModalUrl(hrefWithModal(sp, kind, value, pathname))
    },
    [pathname],
  )
}
