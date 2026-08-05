import type { ContentPack, LevelScript } from '../types'

const BASE = '/content'

export function assetUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('/')) return path
  return `${BASE}/${path}`
}

export async function loadPack(): Promise<ContentPack> {
  const res = await fetch(`${BASE}/levels/pack.json`)
  if (!res.ok) throw new Error('pack_load_failed')
  return res.json()
}

export async function loadLevel(id: string): Promise<LevelScript> {
  const res = await fetch(`${BASE}/levels/${id}.json`)
  if (!res.ok) throw new Error(`level_load_failed:${id}`)
  return res.json()
}

export async function loadApprovedLevels(): Promise<LevelScript[]> {
  const pack = await loadPack()
  const levels = await Promise.all(pack.levels.map(loadLevel))
  return levels.filter((l) => l.approved === true)
}
