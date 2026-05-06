"use client"

import { useRef } from "react"
import { createPortal } from "react-dom"
import { useModal } from "@/lib/useModal"

// Modal frame rendered while a deep-linked album (?album=ID with no stub
// in the click-cache) is fetching. Mirrors AlbumDetail's portal + layout
// so the user sees a frame appear immediately and the real content swaps
// in without a layout jump.
export default function DeepAlbumSkeleton({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal(onClose, dialogRef)

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center animate-backdrop-in backdrop-blur-xs bg-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Loading album"
        tabIndex={-1}
        className="relative bg-bg max-w-2xl w-full mx-4 max-h-[90vh] sm:overflow-visible animate-modal-in flex flex-col sm:flex-row border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:w-72 shrink-0 bg-bg-card sm:aspect-square flex items-center justify-center">
          <span aria-hidden="true" className="text-5xl text-border select-none">♜</span>
        </div>
        <div className="flex-1 px-6 py-5 flex flex-col gap-3 sm:border-l border-t sm:border-t-0 border-border animate-pulse">
          <div className="h-6 bg-bg-card rounded-sm w-3/4" />
          <div className="h-4 bg-bg-card rounded-sm w-1/2" />
          <div className="modal-rule" />
          <div className="h-3 bg-bg-card rounded-sm w-2/5" />
          <div className="flex flex-wrap gap-1.5 mt-1">
            <div className="h-4 w-16 bg-bg-card rounded-sm" />
            <div className="h-4 w-20 bg-bg-card rounded-sm" />
            <div className="h-4 w-12 bg-bg-card rounded-sm" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
