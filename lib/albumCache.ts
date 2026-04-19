import type { AlbumListItem } from "./types"

// Module-level caches of stubs seen on the current page. Cards write their
// stubs here when the user clicks so the corresponding modal can render
// the header (cover / host image / artist art) instantly while the server
// fetch for the full listing resolves in the background.
//
// Bounded with FIFO eviction: long sessions with many scroll-and-click
// interactions would otherwise accumulate unbounded stubs.

const CACHE_CAP = 500

function setBounded<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value)
  if (map.size > CACHE_CAP) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}

const albumCache = new Map<string, AlbumListItem>()

export function cacheAlbumStub(stub: AlbumListItem): void {
  setBounded(albumCache, stub.id, stub)
}

export function getAlbumStub(id: string): AlbumListItem | null {
  return albumCache.get(id) ?? null
}

export interface HostStub {
  id: string
  name: string
  image_id: string | null
  url: string | null
}

const hostCache = new Map<string, HostStub>()

export function cacheHostStub(stub: HostStub): void {
  setBounded(hostCache, stub.id, stub)
}

export function getHostStub(id: string): HostStub | null {
  return hostCache.get(id) ?? null
}

// Artist header cover: first known art_id for the artist. Written when a
// card is clicked so the artist scope modal can paint a cover before the
// album list arrives.
const artistArtCache = new Map<string, string>()

export function cacheArtistArt(artist: string, artId: string): void {
  if (!artistArtCache.has(artist)) setBounded(artistArtCache, artist, artId)
}

export function getArtistArt(artist: string): string | null {
  return artistArtCache.get(artist) ?? null
}
