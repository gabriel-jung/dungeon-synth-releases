import type { ReactNode } from "react"

export default function ModalHeader({
  titleId,
  leading,
  title,
  subtitle,
  chips,
  actions,
}: {
  titleId?: string
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  chips?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading}
        <div className="min-w-0">
          <h2
            id={titleId}
            className="font-display text-base sm:text-lg tracking-[0.02em] text-text-bright truncate"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {chips && (
        <div className="flex items-center gap-1.5 flex-wrap basis-full sm:basis-auto sm:justify-end shrink min-w-0 order-3 sm:order-none">
          {chips}
        </div>
      )}
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
