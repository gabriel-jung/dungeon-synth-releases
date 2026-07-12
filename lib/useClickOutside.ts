"use client"

import { useEffect, type RefObject } from "react"

// Call `onOutside` on any pointer press outside `ref`. `active` gates the
// listener so it only exists while the popover/menu is open.
export function useClickOutside(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside()
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
