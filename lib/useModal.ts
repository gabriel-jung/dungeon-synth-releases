import { RefObject, useEffect, useLayoutEffect, useRef } from "react"

type Entry = { close: () => void; dialogRef?: RefObject<HTMLElement | null> }

// Stack so nested modals only close the topmost on ESC.
const stack: Entry[] = []

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (n) => !n.hasAttribute("disabled") && n.offsetParent !== null,
  )
}

function onKey(e: KeyboardEvent) {
  if (stack.length === 0) return
  const top = stack[stack.length - 1]
  if (e.key === "Escape") {
    top.close()
    return
  }
  if (e.key === "Tab") {
    const dialog = top.dialogRef?.current
    if (!dialog) return
    const nodes = focusables(dialog)
    if (nodes.length === 0) {
      e.preventDefault()
      dialog.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }
}

export function useModal(onClose: () => void, dialogRef?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const entry: Entry = { close: () => onCloseRef.current(), dialogRef }
    if (stack.length === 0) window.addEventListener("keydown", onKey)
    stack.push(entry)
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    // Compensate for the scrollbar disappearing so the page doesn't shift.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = "hidden"
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    const prevFocus = document.activeElement as HTMLElement | null
    dialogRef?.current?.focus()
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
      prevFocus?.focus?.()
    }
  }, [dialogRef])
}
