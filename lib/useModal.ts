import { RefObject, useEffect } from "react"

// Stack so nested modals only close the topmost on ESC.
const stack: Array<() => void> = []

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && stack.length > 0) stack[stack.length - 1]()
}

export function useModal(onClose: () => void, dialogRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (stack.length === 0) window.addEventListener("keydown", onKey)
    stack.push(onClose)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const prevFocus = document.activeElement as HTMLElement | null
    dialogRef?.current?.focus()
    return () => {
      const i = stack.lastIndexOf(onClose)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [onClose, dialogRef])
}
