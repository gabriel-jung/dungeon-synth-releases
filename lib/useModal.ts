import { RefObject, useEffect, useLayoutEffect, useRef } from "react"

// Stack so nested modals only close the topmost on ESC.
const stack: Array<() => void> = []

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && stack.length > 0) stack[stack.length - 1]()
}

export function useModal(onClose: () => void, dialogRef?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const handler = () => onCloseRef.current()
    if (stack.length === 0) window.addEventListener("keydown", onKey)
    stack.push(handler)
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    // Compensate for the scrollbar disappearing so the page doesn't shift.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = "hidden"
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    const prevFocus = document.activeElement as HTMLElement | null
    dialogRef?.current?.focus()
    return () => {
      const i = stack.lastIndexOf(handler)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
      prevFocus?.focus?.()
    }
  }, [dialogRef])
}
