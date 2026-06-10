import type { ReactNode } from "react"

export default function ModalIconButton({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void
  label: string
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="tap-target w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border transition-colors cursor-pointer text-base leading-none"
    >
      {children}
    </button>
  )
}
