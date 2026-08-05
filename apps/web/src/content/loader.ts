import type { ContentPack, LevelScript } from '../types'

const BASE = '/content'

export function assetUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('/')) return path
  return `${BASE}/${path}`
}

export async function listPackIds(): Promise<string[]> {
  const res = await fetch(`${BASE}/levels/packs.json`)
  if (!res.ok) throw new Error('packs_index_failed')
  const data = (await res.json()) as { packs: string[] }
  return data.packs
}

export async function loadPack(packId: string): Promise<ContentPack> {
  const res = await fetch(`${BASE}/levels/packs/${packId}.json`)
  if (!res.ok) throw new Error(`pack_load_failed:${packId}`)
  return res.json()
}

export async function loadLevel(id: string): Promise<LevelScript> {
  const res = await fetch(`${BASE}/levels/${id}.json`)
  if (!res.ok) throw new Error(`level_load_failed:${id}`)
  return res.json()
}

export async function loadApprovedLevels(packId: string): Promise<LevelScript[]> {
  const pack = await loadPack(packId)
  const levels = await Promise.all(pack.levels.map(loadLevel))
  return levels.filter((l) => l.approved === true)
}

export async function loadAllApprovedLevels(): Promise<LevelScript[]> {
  const ids = await listPackIds()
  const nested = await Promise.all(ids.map(loadApprovedLevels))
  return nested.flat()
}

export async function findPackIdForLevel(levelId: string): Promise<string> {
  const ids = await listPackIds()
  for (const id of ids) {
    const pack = await loadPack(id)
    if (pack.levels.includes(levelId)) return id
  }
  throw new Error(`pack_not_found_for_level:${levelId}`)
}
