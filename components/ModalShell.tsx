"use client"

import { useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useModal } from "@/lib/useModal"

// Shared portal + backdrop + dialog frame used by every modal in the app.
// Mobile collapses to full-screen inset-0; desktop keeps centred card with
// max size. Children render inside the dialog; callers build their own
// headers and bodies.
export default function ModalShell({
  titleId,
  ariaLabel,
  size = "lg",
  onClose,
  children,
}: {
  titleId?: string
  ariaLabel?: string
  size?: "sm" | "md" | "lg"
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal(onClose, dialogRef)

  const sizeClass =
    size === "sm" ? "sm:w-[min(24rem,calc(100vw-2rem))]"
    : size === "md" ? "sm:w-[min(36rem,calc(100vw-2rem))]"
    : "sm:w-[min(56rem,calc(100vw-2rem))]"

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center animate-backdrop-in backdrop-blur-xs"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative bg-bg w-full h-dvh ${sizeClass} sm:h-auto sm:max-h-[85vh] sm:mx-4 flex flex-col animate-modal-in sm:border border-border outline-none`}
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
