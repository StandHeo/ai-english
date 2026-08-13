import type { LevelScript } from '../types'
import { deleteAudioClip, putAudioClip } from './audioDb'

export type FamilyDiaryMessage = {
  id: string
  createdAt: number
  text: string
  /** IndexedDB clip id (preferred; keeps localStorage small) */
  audioId?: string
  /** Legacy data URL; migrated off when possible */
  audioDataUrl?: string
}

export type FamilyIconColor = {
  word: string
  fg: string
  bg: string
}

export type FamilyDayRecord = {
  date: string
  /** Merged cache of message texts for level generation */
  story: string
  messages: FamilyDiaryMessage[]
  level: LevelScript | null
  photoHints: string[]
  /** DeepSeek 建议的图标配色 */
  iconColors: FamilyIconColor[]
  /** data URL or blob URL strings attached by parent */
  images: string[]
  completed: boolean
  updatedAt: number
}

type FamilyStore = {
  version: 1
  days: Record<string, FamilyDayRecord>
  deepseekApiKey: string
  /** 通义/百炼 Key（可选；也可只用 API .env） */
  tongyiApiKey: string
  /** 生成关卡后自动通义配图；默认关以免误扣费 */
  autoTongyiImages: boolean
  /** 生成关卡后自动图标配图；默认开；与通义同时开时优先图标 */
  autoIconImages: boolean
  /** 一关最少英文关键词数（target_words + 选项 id 去重） */
  minLevelKeywords: number
}

const KEY = 'ai-english-family-v1'
const DEFAULT_MIN_KEYWORDS = 9

function emptyStore(): FamilyStore {
  return {
    version: 1,
    days: {},
    deepseekApiKey: '',
    tongyiApiKey: '',
    autoTongyiImages: false,
    autoIconImages: true,
    minLevelKeywords: DEFAULT_MIN_KEYWORDS,
  }
}

function clampMinKeywordsStored(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return DEFAULT_MIN_KEYWORDS
  return Math.min(12, Math.max(3, Math.floor(v)))
}

export function getMinLevelKeywords(): number {
  return clampMinKeywordsStored(loadFamilyStore().minLevelKeywords)
}

export function setMinLevelKeywords(n: number): void {
  const store = loadFamilyStore()
  store.minLevelKeywords = clampMinKeywordsStored(n)
  saveFamilyStore(store)
}

/** 配图张数上限 = 设置里的最少关键词数 */
export function getImageSlotMax(): number {
  return getMinLevelKeywords()
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
      ...(typeof m.audioId === 'string' && m.audioId ? { audioId: m.audioId } : {}),
      ...(typeof m.audioDataUrl === 'string' && m.audioDataUrl
        ? { audioDataUrl: m.audioDataUrl }
        : {}),
    })
  }
  return out
}

function messageHasVoice(m: FamilyDiaryMessage): boolean {
  return Boolean(m.audioId || m.audioDataUrl)
}

function normalizeIconColors(raw: unknown): FamilyIconColor[] {
  if (!Array.isArray(raw)) return []
  const hex = /^#([0-9A-Fa-f]{6})$/
  const out: FamilyIconColor[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const word = String(o.word || '').trim().toLowerCase()
    const fg = String(o.fg || '').trim()
    const bg = String(o.bg || '').trim()
    if (!word || !hex.test(fg) || !hex.test(bg)) continue
    out.push({ word, fg: fg.toUpperCase(), bg: bg.toUpperCase() })
  }
  return out.slice(0, 12)
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
    iconColors: normalizeIconColors(raw?.iconColors),
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
      tongyiApiKey: typeof parsed.tongyiApiKey === 'string' ? parsed.tongyiApiKey : '',
      autoTongyiImages: Boolean(parsed.autoTongyiImages),
      autoIconImages: Boolean(parsed.autoIconImages),
      minLevelKeywords: clampMinKeywordsStored(parsed.minLevelKeywords),
    }
  } catch {
    return emptyStore()
  }
}

/** Drop bulky legacy data-URL audio so metadata still fits in localStorage. */
function stripLegacyAudioDataUrls(store: FamilyStore): FamilyStore {
  const days: Record<string, FamilyDayRecord> = {}
  for (const [date, day] of Object.entries(store.days)) {
    days[date] = {
      ...day,
      messages: day.messages.map((m) => {
        if (!m.audioDataUrl) return m
        const { audioDataUrl: _drop, ...rest } = m
        return rest.audioId ? rest : { ...rest, audioId: rest.id }
      }),
    }
  }
  return { ...store, days }
}

export function saveFamilyStore(store: FamilyStore): void {
  const raw = JSON.stringify(store)
  try {
    localStorage.setItem(KEY, raw)
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name !== 'QuotaExceededError' && name !== 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw err
    }
    // Retry without embedded audio payloads (clips live in IndexedDB).
    localStorage.setItem(KEY, JSON.stringify(stripLegacyAudioDataUrls(store)))
  }
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
    .filter((d) => d.messages.some(messageHasVoice))
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
      iconColors: [],
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

export async function appendVoiceMessage(
  date: string,
  opts: { text: string; blob: Blob },
): Promise<FamilyDayRecord> {
  ensureMessagesMigrated(date)
  const prev = getDay(date)!
  const id = newMessageId()
  await putAudioClip(id, opts.blob)
  const messages = [
    ...prev.messages,
    {
      id,
      createdAt: Date.now(),
      text: opts.text.trim(),
      audioId: id,
    },
  ]
  try {
    return persistDay(date, { messages })
  } catch (err) {
    await deleteAudioClip(id).catch(() => undefined)
    throw err
  }
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

export function deleteMessage(
  date: string,
  messageId: string,
): FamilyDayRecord | null {
  ensureMessagesMigrated(date)
  const prev = getDay(date)
  if (!prev) return null
  const target = prev.messages.find((m) => m.id === messageId)
  if (!target) return null
  const messages = prev.messages.filter((m) => m.id !== messageId)
  const day = persistDay(date, { messages })
  const clipId = target.audioId || (target.audioDataUrl ? target.id : null)
  if (clipId) void deleteAudioClip(clipId).catch(() => undefined)
  return day
}

export function getMessages(date: string): FamilyDiaryMessage[] {
  return ensureMessagesMigrated(date).messages
}

/** @returns error message if blocked without force */
export function saveGeneratedLevel(
  date: string,
  level: LevelScript,
  photoHints: string[],
  opts: { force?: boolean; iconColors?: FamilyIconColor[] } = {},
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
    iconColors: normalizeIconColors(opts.iconColors),
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
  const next = { ...prev, images: images.slice(0, getImageSlotMax()), updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

/**
 * 写入自动配图：fill_empty 只填空位（保留相册图）；replace 整表替换（需家长确认）。
 */
export function applyGeneratedImages(
  date: string,
  autoImages: string[],
  mode: 'fill_empty' | 'replace',
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.level) return null
  const max = getImageSlotMax()
  const incoming = autoImages.filter(Boolean).slice(0, max)
  let images: string[]
  if (mode === 'replace') {
    images = incoming
  } else {
    images = [...prev.images].slice(0, max)
    for (const img of incoming) {
      if (images.length >= max) break
      const hole = images.findIndex((x) => !x)
      if (hole >= 0) images[hole] = img
      else images.push(img)
    }
  }
  const next = { ...prev, images, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function removeDayImage(
  date: string,
  imageIndex: number,
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.level) return null
  if (imageIndex < 0 || imageIndex >= prev.images.length) return null
  const images = prev.images.filter((_, i) => i !== imageIndex)
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

export function getTongyiKey(): string {
  return loadFamilyStore().tongyiApiKey
}

export function setTongyiKey(key: string): void {
  const store = loadFamilyStore()
  store.tongyiApiKey = key.trim()
  saveFamilyStore(store)
}

export function clearTongyiKey(): void {
  setTongyiKey('')
}

export function getAutoTongyiImages(): boolean {
  return loadFamilyStore().autoTongyiImages
}

export function setAutoTongyiImages(on: boolean): void {
  const store = loadFamilyStore()
  store.autoTongyiImages = Boolean(on)
  saveFamilyStore(store)
}

export function getAutoIconImages(): boolean {
  return loadFamilyStore().autoIconImages
}

export function setAutoIconImages(on: boolean): void {
  const store = loadFamilyStore()
  store.autoIconImages = Boolean(on)
  saveFamilyStore(store)
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
