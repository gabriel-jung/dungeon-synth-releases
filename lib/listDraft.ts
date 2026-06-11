"use client"

// localStorage plumbing for the /list builder: the single working draft
// (mirrors the URL state), and a small shelf of explicitly saved lists.
// Shared with the album modal so "Add to list" works from anywhere on the
// site, with or without a mounted builder.

import { type AlbumListItem } from "@/lib/types"
import { MAX_ITEMS } from "@/lib/listCodec"

export const DRAFT_KEY = "ds-list-draft-v1"
export const SAVED_KEY = "ds-list-saved-v1"
export const MAX_SAVED = 20

export type ListDraft = { d: string; albums: AlbumListItem[] }
export type SavedList = {
  d: string
  title: string
  count: number
  savedAt: number
  albums: AlbumListItem[]
}

export type AddToListResult = "added" | "exists" | "full"

// Albums added from the album modal while no builder is editing. They are NOT
// merged into the last-session draft (that one is an archived "Resume" entry);
// the next bare /list visit starts a fresh list from this queue.
export const PENDING_KEY = "ds-list-pending-v1"

export function readPending(): AlbumListItem[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    const parsed = raw ? (JSON.parse(raw) as AlbumListItem[]) : []
    return Array.isArray(parsed) ? parsed.filter((a) => typeof a?.id === "string") : []
  } catch {
    return []
  }
}

export function clearPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

// Events answered by an editing builder on the same page (dispatchEvent is
// synchronous, so the handler's verdict is readable right after).
export type ListAddEvent = CustomEvent<AlbumListItem> & { dsResult?: AddToListResult }
export type ListHasEvent = CustomEvent<string> & { dsHas?: boolean }

function draftHas(id: string): boolean {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return false
    const draft = JSON.parse(raw) as ListDraft
    return (draft.albums ?? []).some((a) => a.id === id)
  } catch {
    return false
  }
}

// Add an album to the user's list. An editing builder on the page claims the
// event (preventDefault) and reports the outcome; otherwise the album is
// queued for the next /list visit, unless it's already in the queue or in the
// autosaved working list.
export async function addToList(album: AlbumListItem): Promise<AddToListResult> {
  const ev = new CustomEvent<AlbumListItem>("ds-list-add", { detail: album, cancelable: true }) as ListAddEvent
  if (!window.dispatchEvent(ev)) return ev.dsResult ?? "added" // a mounted builder handled it

  const pending = readPending()
  if (pending.some((a) => a.id === album.id) || draftHas(album.id)) return "exists"
  if (pending.length >= MAX_ITEMS) return "full"
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([...pending, album]))
  } catch {
    /* quota / private mode: not persisted */
  }
  return "added"
}

// Is this album already in the user's list? Checks, in order: the working
// list of a mounted builder, the add queue, the autosaved draft. Lets the
// album modal show "In list ✓" before any click.
export function isInList(id: string): boolean {
  const ev = new CustomEvent<string>("ds-list-has", { detail: id }) as ListHasEvent
  window.dispatchEvent(ev)
  if (ev.dsHas !== undefined) return ev.dsHas
  return readPending().some((a) => a.id === id) || draftHas(id)
}

export function readSavedLists(): SavedList[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY)
    const parsed = raw ? (JSON.parse(raw) as SavedList[]) : []
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s?.d === "string") : []
  } catch {
    return []
  }
}

// Save (or refresh) a snapshot; newest first, deduped by payload, capped.
export function saveList(entry: SavedList): SavedList[] {
  const next = [entry, ...readSavedLists().filter((s) => s.d !== entry.d)].slice(0, MAX_SAVED)
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode: not persisted */
  }
  return next
}

export function deleteSavedList(d: string): SavedList[] {
  const next = readSavedLists().filter((s) => s.d !== d)
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
  return next
}
