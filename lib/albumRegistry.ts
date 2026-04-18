const stack: string[] = []

function syncUrl() {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  const top = stack[stack.length - 1] ?? null
  if (url.searchParams.get("album") === top) return
  if (top) url.searchParams.set("album", top)
  else url.searchParams.delete("album")
  history.replaceState(null, "", url)
}

export function register(id: string) {
  stack.push(id)
  syncUrl()
}

export function unregister(id: string) {
  const i = stack.lastIndexOf(id)
  if (i >= 0) stack.splice(i, 1)
  syncUrl()
}

export function has(id: string) {
  return stack.includes(id)
}
