import type { LevelScript } from '../types'

export type FamilyDayRecord = {
  date: string
  story: string
  level: LevelScript | null
  photoHints: string[]
  /** data URL or blob URL strings attached by parent */
  images: string[]
  completed: boolean
  updatedAt: number
}

type FamilyStore = {
  version: 1
  days: Record<string, FamilyDayRecord>
  deepseekApiKey: string
}

const KEY = 'ai-english-family-v1'

function emptyStore(): FamilyStore {
  return { version: 1, days: {}, deepseekApiKey: '' }
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function loadFamilyStore(): FamilyStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as FamilyStore
    return {
      version: 1,
      days: parsed.days || {},
      deepseekApiKey: typeof parsed.deepseekApiKey === 'string' ? parsed.deepseekApiKey : '',
    }
  } catch {
    return emptyStore()
  }
}

export function saveFamilyStore(store: FamilyStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getDay(date: string): FamilyDayRecord | null {
  return loadFamilyStore().days[date] || null
}

export function listDaysWithLevels(): FamilyDayRecord[] {
  return Object.values(loadFamilyStore().days)
    .filter((d) => d.level)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function upsertStory(date: string, story: string): FamilyDayRecord {
  const store = loadFamilyStore()
  const prev = store.days[date]
  const next: FamilyDayRecord = {
    date,
    story,
    level: prev?.level || null,
    photoHints: prev?.photoHints || [],
    images: prev?.images || [],
    completed: prev?.completed || false,
    updatedAt: Date.now(),
  }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function appendStory(date: string, chunk: string): FamilyDayRecord {
  const prev = getDay(date)
  const base = (prev?.story || '').trim()
  const add = chunk.trim()
  const story = base ? `${base}\n${add}` : add
  return upsertStory(date, story)
}

/** @returns error message if blocked without force */
export function saveGeneratedLevel(
  date: string,
  level: LevelScript,
  photoHints: string[],
  opts: { force?: boolean } = {},
): { ok: true; day: FamilyDayRecord } | { ok: false; reason: 'needs_confirm' } {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (prev?.completed && prev.level && !opts.force) {
    return { ok: false, reason: 'needs_confirm' }
  }
  const next: FamilyDayRecord = {
    date,
    story: prev?.story || '',
    level,
    photoHints,
    images: opts.force || !prev?.completed ? [] : prev?.images || [],
    completed: false,
    updatedAt: Date.now(),
  }
  // fresh generate clears images unless we want to keep — design: overwrite script; clear images on regen
  next.images = []
  store.days[date] = next
  saveFamilyStore(store)
  return { ok: true, day: next }
}

export function setDayImages(date: string, images: string[]): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.level) return null
  const next = { ...prev, images, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function markDayCompleted(date: string): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.level) return null
  const next = { ...prev, completed: true, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function getDeepseekKey(): string {
  return loadFamilyStore().deepseekApiKey
}

export function setDeepseekKey(key: string): void {
  const store = loadFamilyStore()
  store.deepseekApiKey = key.trim()
  saveFamilyStore(store)
}

export function clearDeepseekKey(): void {
  setDeepseekKey('')
}

/** Apply album/placeholder images onto a copy of the level for play */
export function materializeLevelForPlay(day: FamilyDayRecord): LevelScript {
  if (!day.level) throw new Error('no_level')
  const level = structuredClone(day.level)
  const imgs = day.images
  const placeholder = (word: string) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="100%" height="100%" fill="#ffe8c8"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-family="sans-serif" font-size="48" fill="#5a3d1b">${word}</text>
      </svg>`,
    )}`

  const pick = (i: number, fallbackWord: string) =>
    imgs[i] || imgs[0] || placeholder(fallbackWord)

  const mainWord = level.target_words[0] || 'fun'
  level.scene.image = pick(0, mainWord)
  level.reward.stickerImage = pick(0, mainWord)

  level.beats = level.beats.map((beat, bi) => {
    const word = beat.expect?.[0] || level.target_words[bi % level.target_words.length] || mainWord
    const show = beat.show ? pick(Math.min(bi, Math.max(imgs.length - 1, 0)), word) : beat.show
    const mapOpts = (opts?: { id: string; image: string; correct: boolean }[]) =>
      opts?.map((o, oi) => ({
        ...o,
        image: pick(o.correct ? 0 : Math.min(oi + 1, 2), o.id || word),
      }))
    return {
      ...beat,
      show,
      options: mapOpts(beat.options),
      fallback: beat.fallback
        ? { ...beat.fallback, options: mapOpts(beat.fallback.options) || beat.fallback.options }
        : beat.fallback,
    }
  })
  return level
}
