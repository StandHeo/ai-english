import type { LevelScript } from '../types'

export type FamilyDiaryMessage = {
  id: string
  createdAt: number
  text: string
  /** data URL for short diary clips; optional for text-only */
  audioDataUrl?: string
}

export type FamilyDayRecord = {
  date: string
  /** Merged cache of message texts for level generation */
  story: string
  messages: FamilyDiaryMessage[]
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

export function newMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function mergeStoryFromMessages(messages: FamilyDiaryMessage[]): string {
  return messages
    .map((m) => m.text.trim())
    .filter(Boolean)
    .join('\n')
}

function normalizeMessages(raw: unknown): FamilyDiaryMessage[] {
  if (!Array.isArray(raw)) return []
  const out: FamilyDiaryMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Partial<FamilyDiaryMessage>
    if (typeof m.id !== 'string' || typeof m.createdAt !== 'number') continue
    out.push({
      id: m.id,
      createdAt: m.createdAt,
      text: typeof m.text === 'string' ? m.text : '',
      ...(typeof m.audioDataUrl === 'string' && m.audioDataUrl
        ? { audioDataUrl: m.audioDataUrl }
        : {}),
    })
  }
  return out
}

function normalizeDay(date: string, raw: Partial<FamilyDayRecord> | undefined): FamilyDayRecord {
  const messages = normalizeMessages(raw?.messages)
  const story =
    typeof raw?.story === 'string'
      ? raw.story
      : mergeStoryFromMessages(messages)
  return {
    date,
    story,
    messages,
    level: raw?.level || null,
    photoHints: Array.isArray(raw?.photoHints) ? raw.photoHints.map(String) : [],
    images: Array.isArray(raw?.images) ? raw.images.map(String) : [],
    completed: Boolean(raw?.completed),
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

export function loadFamilyStore(): FamilyStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as FamilyStore
    const days: Record<string, FamilyDayRecord> = {}
    for (const [date, day] of Object.entries(parsed.days || {})) {
      days[date] = normalizeDay(date, day)
    }
    return {
      version: 1,
      days,
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

export function listDaysWithVoice(): string[] {
  return Object.values(loadFamilyStore().days)
    .filter((d) => d.messages.some((m) => Boolean(m.audioDataUrl)))
    .map((d) => d.date)
}

/** Migrate legacy story-only days into a single text message. */
export function ensureMessagesMigrated(date: string): FamilyDayRecord {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev) {
    const empty: FamilyDayRecord = {
      date,
      story: '',
      messages: [],
      level: null,
      photoHints: [],
      images: [],
      completed: false,
      updatedAt: Date.now(),
    }
    store.days[date] = empty
    saveFamilyStore(store)
    return empty
  }
  if (prev.messages.length > 0) return prev
  const story = (prev.story || '').trim()
  if (!story) return prev
  const messages: FamilyDiaryMessage[] = [
    {
      id: newMessageId(),
      createdAt: prev.updatedAt || Date.now(),
      text: story,
    },
  ]
  const next: FamilyDayRecord = {
    ...prev,
    messages,
    story,
    updatedAt: Date.now(),
  }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

function persistDay(date: string, patch: Partial<FamilyDayRecord>): FamilyDayRecord {
  const store = loadFamilyStore()
  const prev = store.days[date]
  const base = prev || normalizeDay(date, undefined)
  const messages = patch.messages ?? base.messages
  const next: FamilyDayRecord = {
    ...base,
    ...patch,
    date,
    messages,
    story:
      patch.story !== undefined
        ? patch.story
        : mergeStoryFromMessages(messages),
    updatedAt: Date.now(),
  }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function upsertStory(date: string, story: string): FamilyDayRecord {
  const day = ensureMessagesMigrated(date)
  // Keep messages; treat whole-story edit as replacing merged cache only when no messages?
  // Legacy callers: sync a single editable story into one message when editing whole text.
  if (day.messages.length <= 1) {
    const messages =
      day.messages.length === 1
        ? [{ ...day.messages[0], text: story }]
        : story.trim()
          ? [{ id: newMessageId(), createdAt: Date.now(), text: story }]
          : []
    return persistDay(date, { messages, story })
  }
  return persistDay(date, { story })
}

export function appendStory(date: string, chunk: string): FamilyDayRecord {
  return appendTextMessage(date, chunk)
}

export function appendTextMessage(date: string, text: string): FamilyDayRecord {
  ensureMessagesMigrated(date)
  const add = text.trim()
  if (!add) {
    return getDay(date) || ensureMessagesMigrated(date)
  }
  const prev = getDay(date)!
  const messages = [
    ...prev.messages,
    { id: newMessageId(), createdAt: Date.now(), text: add },
  ]
  return persistDay(date, { messages })
}

export function appendVoiceMessage(
  date: string,
  opts: { text: string; audioDataUrl: string },
): FamilyDayRecord {
  ensureMessagesMigrated(date)
  const prev = getDay(date)!
  const messages = [
    ...prev.messages,
    {
      id: newMessageId(),
      createdAt: Date.now(),
      text: opts.text.trim(),
      audioDataUrl: opts.audioDataUrl,
    },
  ]
  return persistDay(date, { messages })
}

export function updateMessageText(
  date: string,
  messageId: string,
  text: string,
): FamilyDayRecord | null {
  ensureMessagesMigrated(date)
  const prev = getDay(date)
  if (!prev) return null
  const messages = prev.messages.map((m) =>
    m.id === messageId ? { ...m, text } : m,
  )
  if (!messages.some((m) => m.id === messageId)) return null
  return persistDay(date, { messages })
}

export function getMessages(date: string): FamilyDiaryMessage[] {
  return ensureMessagesMigrated(date).messages
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
  const base = prev || normalizeDay(date, undefined)
  const next: FamilyDayRecord = {
    ...base,
    date,
    story: base.story || mergeStoryFromMessages(base.messages),
    messages: base.messages,
    level,
    photoHints,
    images: [],
    completed: false,
    updatedAt: Date.now(),
  }
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
