"use client"

import { useSyncExternalStore } from "react"

// Module-scoped one-shot hydration flag, shared across every consumer so a
// long feed (DateHeading, DateSlider, ...) doesn't pay one useState +
// useEffect per row. Subscribers flip on the first subscribe call after
// mount; SSR returns false.
let hydrated = false
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (!hydrated) {
    hydrated = true
    for (const l of listeners) l()
  }
  return () => { listeners.delete(cb) }
}

const getSnapshot = () => hydrated
const getServerSnapshot = () => false

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
