import GraphsScopeNav from "@/components/GraphsScopeNav"
import { Suspense } from "react"

export default function GraphsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 sm:px-6 pt-1 pb-2">
        <Suspense>
          <GraphsScopeNav />
        </Suspense>
      </div>
      <div aria-hidden className="shrink-0 h-px mx-4 sm:mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
