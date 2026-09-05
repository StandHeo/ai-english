import type { LevelScript } from '../types'
import { shuffleLevelOptions } from '../content/shuffleLevelOptions'
import { deleteAudioClip, putAudioClip } from './audioDb'
import {
  deleteImageBlob,
  isInlineImageRef,
  resolveImageRef,
  storeImageDataUrl,
} from './imageDb'
import {
  clampImageSlots,
  firstItemImage,
  imageUrlBySubject,
  slotsForMiniLevel,
  slotsFromLevel,
} from './imageSlots'
import {
  DEFAULT_FAMILY_LLM,
  DEFAULT_IMAGE_CLOUD,
  isFamilyLlmProvider,
  isImageCloudProvider,
  type FamilyImageCloudProvider,
  type FamilyLlmProvider,
} from './providers'

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

/** 当日迷你 pack 中的一关（对齐官方「一词一景」） */
export type FamilyMiniLevel = {
  id: string
  level: LevelScript
  /** 可编辑出图主题；缺省用 level.scene.setting */
  scenePrompt?: string
  /** scenePrompt 的英文译文缓存（配图用）；场景词变化时清空 */
  scenePromptEn?: string
  itemPrompts?: string[]
  /** IndexedDB 图 id（持久化） */
  imageBgId?: string
  itemImageIds?: string[]
  /**
   * 运行时 / 旧数据内联图（data URL 或 blob URL）。
   * 写入 localStorage 前会剥掉大图，只保留 *Id。
   */
  imageBg?: string
  itemImages?: string[]
  completed?: boolean
}

export type FamilyDayPack = {
  title: string
  theme: 'family'
  levelIds: string[]
}

export type FamilyDayRecord = {
  date: string
  /** Merged cache of message texts for level generation */
  story: string
  messages: FamilyDiaryMessage[]
  /** 旧：一天一关；新生成默认不写，仅 legacy 保留 */
  level: LevelScript | null
  photoHints: string[]
  /** DeepSeek 建议的图标配色 */
  iconColors: FamilyIconColor[]
  /** data URL or blob URL strings attached by parent（legacy 扁平配图） */
  images: string[]
  /** 新：迷你 pack 元数据 */
  pack?: FamilyDayPack | null
  /** 新：当日多关 */
  miniLevels?: FamilyMiniLevel[]
  completed: boolean
  updatedAt: number
}

type FamilyStore = {
  version: 1
  days: Record<string, FamilyDayRecord>
  deepseekApiKey: string
  /** 通义/百炼 Key（可选；也可只用 API .env） */
  tongyiApiKey: string
  /** Agnes 文本+配图共用 Key */
  agnesApiKey: string
  llmProvider: FamilyLlmProvider
  imageCloudProvider: FamilyImageCloudProvider
  /** 生成关卡后自动云端配图；默认关以免误扣费 */
  autoTongyiImages: boolean
  /**
   * 设置项：今日迷你 pack 关数目标（兼旧「最少关键词」）。
   * 实际关数见 getPackLevelCount()，夹紧到 3–5。
   */
  minLevelKeywords: number
}

const KEY = 'ai-english-family-v1'
const DEFAULT_MIN_KEYWORDS = 4

function emptyStore(): FamilyStore {
  return {
    version: 1,
    days: {},
    deepseekApiKey: '',
    tongyiApiKey: '',
    agnesApiKey: '',
    llmProvider: DEFAULT_FAMILY_LLM,
    imageCloudProvider: DEFAULT_IMAGE_CLOUD,
    autoTongyiImages: false,
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

/** 今日迷你 pack 关数（3–5） */
export function getPackLevelCount(): number {
  return Math.min(5, Math.max(3, getMinLevelKeywords()))
}

/** 配图张数上限 = 设置里的最少关键词数（legacy 扁平图）；pack 按关另算 */
export function getImageSlotMax(): number {
  return getMinLevelKeywords()
}

export function dayHasPlayableContent(day: FamilyDayRecord | null | undefined): boolean {
  if (!day) return false
  return Boolean(day.level) || (Array.isArray(day.miniLevels) && day.miniLevels.length > 0)
}

export function dayHasMiniPack(day: FamilyDayRecord | null | undefined): boolean {
  return Boolean(day && Array.isArray(day.miniLevels) && day.miniLevels.length > 0)
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

function normalizeMiniLevels(raw: unknown): FamilyMiniLevel[] {
  if (!Array.isArray(raw)) return []
  const out: FamilyMiniLevel[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Partial<FamilyMiniLevel>
    if (typeof o.id !== 'string' || !o.id || !o.level || typeof o.level !== 'object') continue
    out.push({
      id: o.id,
      level: o.level as LevelScript,
      ...(typeof o.scenePrompt === 'string' && o.scenePrompt.trim()
        ? { scenePrompt: o.scenePrompt.trim() }
        : {}),
      ...(typeof o.scenePromptEn === 'string' && o.scenePromptEn.trim()
        ? { scenePromptEn: o.scenePromptEn.trim() }
        : {}),
      ...(Array.isArray(o.itemPrompts)
        ? { itemPrompts: o.itemPrompts.map(String).filter((s) => s.trim()) }
        : {}),
      ...(typeof o.imageBgId === 'string' && o.imageBgId ? { imageBgId: o.imageBgId } : {}),
      ...(Array.isArray(o.itemImageIds)
        ? { itemImageIds: o.itemImageIds.map(String).filter(Boolean) }
        : {}),
      // 仅保留非巨型内联引用；data URL 留给 hydrate / 迁移，不进 normalize 持久化路径
      ...(typeof o.imageBg === 'string' && o.imageBg && !isInlineImageRef(o.imageBg)
        ? { imageBg: o.imageBg }
        : typeof o.imageBg === 'string' && o.imageBg.startsWith('data:image')
          ? { imageBg: o.imageBg }
          : {}),
      ...(Array.isArray(o.itemImages)
        ? { itemImages: o.itemImages.map(String).filter(Boolean) }
        : {}),
      completed: Boolean(o.completed),
    })
  }
  return out
}

/** localStorage 只留元数据 + 图 id，去掉 data URL 大图 */
function slimMiniLevelForPersist(m: FamilyMiniLevel): FamilyMiniLevel {
  const next: FamilyMiniLevel = {
    id: m.id,
    level: m.level,
    completed: Boolean(m.completed),
  }
  if (m.scenePrompt?.trim()) next.scenePrompt = m.scenePrompt.trim()
  if (m.scenePromptEn?.trim()) next.scenePromptEn = m.scenePromptEn.trim()
  if (m.itemPrompts?.length) next.itemPrompts = m.itemPrompts
  if (m.imageBgId) next.imageBgId = m.imageBgId
  if (m.itemImageIds?.length) next.itemImageIds = m.itemImageIds
  // 兼容：尚无 id 的旧短引用可留；data URL 一律丢掉（应已迁入 IDB）
  if (m.imageBg && !isInlineImageRef(m.imageBg) && !m.imageBgId) next.imageBg = m.imageBg
  if (m.itemImages?.length && !m.itemImageIds?.length) {
    const small = m.itemImages.filter((u) => u && !isInlineImageRef(u))
    if (small.length) next.itemImages = small
  }
  return next
}

function slimDayForPersist(day: FamilyDayRecord): FamilyDayRecord {
  return {
    ...day,
    images: (day.images || []).filter((u) => u && !isInlineImageRef(u)),
    miniLevels: (day.miniLevels || []).map(slimMiniLevelForPersist),
    messages: day.messages.map((m) => {
      if (!m.audioDataUrl) return m
      const { audioDataUrl: _drop, ...rest } = m
      return rest.audioId ? rest : { ...rest, audioId: rest.id }
    }),
  }
}

function slimStoreForPersist(store: FamilyStore): FamilyStore {
  const days: Record<string, FamilyDayRecord> = {}
  for (const [date, day] of Object.entries(store.days)) {
    days[date] = slimDayForPersist(day)
  }
  return { ...store, days }
}

function normalizePack(raw: unknown, miniLevels: FamilyMiniLevel[]): FamilyDayPack | null {
  if (raw && typeof raw === 'object') {
    const o = raw as Partial<FamilyDayPack>
    const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'My Day'
    const levelIds = Array.isArray(o.levelIds)
      ? o.levelIds.map(String).filter(Boolean)
      : miniLevels.map((m) => m.id)
    return { title, theme: 'family', levelIds }
  }
  if (miniLevels.length) {
    return {
      title: 'My Day',
      theme: 'family',
      levelIds: miniLevels.map((m) => m.id),
    }
  }
  return null
}

function deriveDayCompleted(day: {
  completed?: boolean
  level?: LevelScript | null
  miniLevels?: FamilyMiniLevel[]
}): boolean {
  if (day.miniLevels && day.miniLevels.length > 0) {
    return day.miniLevels.every((m) => Boolean(m.completed))
  }
  return Boolean(day.completed)
}

function normalizeDay(date: string, raw: Partial<FamilyDayRecord> | undefined): FamilyDayRecord {
  const messages = normalizeMessages(raw?.messages)
  const story =
    typeof raw?.story === 'string'
      ? raw.story
      : mergeStoryFromMessages(messages)
  const miniLevels = normalizeMiniLevels(raw?.miniLevels)
  const pack = normalizePack(raw?.pack, miniLevels)
  return {
    date,
    story,
    messages,
    level: raw?.level || null,
    photoHints: Array.isArray(raw?.photoHints) ? raw.photoHints.map(String) : [],
    iconColors: normalizeIconColors(raw?.iconColors),
    images: Array.isArray(raw?.images) ? raw.images.map(String) : [],
    pack,
    miniLevels,
    completed: deriveDayCompleted({
      completed: raw?.completed,
      level: raw?.level || null,
      miniLevels,
    }),
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
      agnesApiKey: typeof parsed.agnesApiKey === 'string' ? parsed.agnesApiKey : '',
      llmProvider: isFamilyLlmProvider(String(parsed.llmProvider || ''))
        ? parsed.llmProvider
        : DEFAULT_FAMILY_LLM,
      imageCloudProvider: isImageCloudProvider(String(parsed.imageCloudProvider || ''))
        ? parsed.imageCloudProvider
        : DEFAULT_IMAGE_CLOUD,
      autoTongyiImages: Boolean(parsed.autoTongyiImages),
      minLevelKeywords: clampMinKeywordsStored(parsed.minLevelKeywords),
    }
  } catch {
    return emptyStore()
  }
}

/** Drop bulky legacy data-URL audio so metadata still fits in localStorage. */
function stripLegacyAudioDataUrls(store: FamilyStore): FamilyStore {
  return slimStoreForPersist(store)
}

export function saveFamilyStore(store: FamilyStore): void {
  const slim = slimStoreForPersist(store)
  const raw = JSON.stringify(slim)
  try {
    localStorage.setItem(KEY, raw)
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name !== 'QuotaExceededError' && name !== 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw err
    }
    // 再剥一遍音频内联（已含在 slim 中）；仍失败则抛出
    localStorage.setItem(KEY, JSON.stringify(stripLegacyAudioDataUrls(store)))
  }
}

export function getDay(date: string): FamilyDayRecord | null {
  return loadFamilyStore().days[date] || null
}

export function listDaysWithLevels(): FamilyDayRecord[] {
  return Object.values(loadFamilyStore().days)
    .filter((d) => dayHasPlayableContent(d))
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
      pack: null,
      miniLevels: [],
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
  if (prev?.completed && dayHasPlayableContent(prev) && !opts.force) {
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
    pack: null,
    miniLevels: [],
    completed: false,
    updatedAt: Date.now(),
  }
  store.days[date] = next
  saveFamilyStore(store)
  return { ok: true, day: next }
}

export function saveGeneratedPack(
  date: string,
  input: {
    title: string
    levels: LevelScript[]
    photoHints?: string[]
    force?: boolean
  },
): { ok: true; day: FamilyDayRecord } | { ok: false; reason: 'needs_confirm' } {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (prev?.completed && dayHasPlayableContent(prev) && !input.force) {
    return { ok: false, reason: 'needs_confirm' }
  }
  const base = prev || normalizeDay(date, undefined)
  const miniLevels: FamilyMiniLevel[] = input.levels.map((level) => {
    const id = level.id || `family-${date.replace(/-/g, '')}-day`
    const setting = String(level.scene?.setting || level.target_words?.[0] || 'playground')
    return {
      id,
      level: { ...level, id },
      scenePrompt: setting,
      completed: false,
    }
  })
  const pack: FamilyDayPack = {
    title: input.title.trim() || 'My Day',
    theme: 'family',
    levelIds: miniLevels.map((m) => m.id),
  }
  const next: FamilyDayRecord = {
    ...base,
    date,
    story: base.story || mergeStoryFromMessages(base.messages),
    messages: base.messages,
    level: null,
    photoHints: Array.isArray(input.photoHints) ? input.photoHints.map(String) : [],
    iconColors: [],
    images: [],
    pack,
    miniLevels,
    completed: false,
    updatedAt: Date.now(),
  }
  store.days[date] = next
  saveFamilyStore(store)
  return { ok: true, day: next }
}

export function getMiniLevel(
  date: string,
  levelId: string,
): FamilyMiniLevel | null {
  const day = getDay(date)
  if (!day?.miniLevels?.length) return null
  return day.miniLevels.find((m) => m.id === levelId) || null
}

export function setMiniLevelScenePrompt(
  date: string,
  levelId: string,
  scenePrompt: string,
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.miniLevels?.length) return null
  const prompt = scenePrompt.trim()
  if (!prompt) return null
  const miniLevels = prev.miniLevels.map((m) => {
    if (m.id !== levelId) return m
    const next: FamilyMiniLevel = { ...m, scenePrompt: prompt }
    // 场景词变了，英文缓存失效
    if (next.scenePromptEn) delete next.scenePromptEn
    return next
  })
  if (!miniLevels.some((m) => m.id === levelId)) return null
  const next = { ...prev, miniLevels, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

/** 缓存场景词英文译文（配图前调用；场景词本身不变） */
export function cacheMiniLevelScenePromptEn(
  date: string,
  levelId: string,
  scenePromptEn: string,
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  const cur = prev?.miniLevels?.find((m) => m.id === levelId)
  const promptEn = scenePromptEn.trim()
  if (!cur || !promptEn || effectiveScenePrompt(cur) === promptEn) return null
  const miniLevels = prev!.miniLevels!.map((m) =>
    m.id === levelId ? { ...m, scenePromptEn: promptEn } : m,
  )
  const next = { ...prev!, miniLevels, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export function resetMiniLevelScenePrompt(
  date: string,
  levelId: string,
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.miniLevels?.length) return null
  const miniLevels = prev.miniLevels.map((m) => {
    if (m.id !== levelId) return m
    const setting = String(m.level.scene?.setting || m.level.target_words?.[0] || 'playground')
    const next: FamilyMiniLevel = { ...m, scenePrompt: setting }
    if (next.scenePromptEn) delete next.scenePromptEn
    return next
  })
  if (!miniLevels.some((m) => m.id === levelId)) return null
  const next = { ...prev, miniLevels, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
}

export async function setMiniLevelImages(
  date: string,
  levelId: string,
  opts: { imageBg?: string; itemImages?: string[] },
): Promise<FamilyDayRecord | null> {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.miniLevels?.length) return null
  const cur = prev.miniLevels.find((m) => m.id === levelId)
  if (!cur) return null

  let imageBgId = cur.imageBgId
  let itemImageIds = cur.itemImageIds ? [...cur.itemImageIds] : undefined
  let imageBgResolved: string | undefined
  let itemImagesResolved: string[] | undefined

  if (opts.imageBg !== undefined) {
    if (cur.imageBgId) void deleteImageBlob(cur.imageBgId).catch(() => undefined)
    if (opts.imageBg) {
      if (isInlineImageRef(opts.imageBg) || opts.imageBg.startsWith('data:')) {
        imageBgId = await storeImageDataUrl(opts.imageBg, `bg_${levelId}`)
        imageBgResolved = opts.imageBg
      } else {
        imageBgId = undefined
        imageBgResolved = opts.imageBg
      }
    } else {
      imageBgId = undefined
      imageBgResolved = undefined
    }
  }

  if (opts.itemImages !== undefined) {
    for (const oldId of cur.itemImageIds || []) {
      void deleteImageBlob(oldId).catch(() => undefined)
    }
    const incoming = opts.itemImages.filter(Boolean)
    itemImageIds = []
    itemImagesResolved = []
    for (const img of incoming) {
      if (isInlineImageRef(img) || img.startsWith('data:')) {
        const id = await storeImageDataUrl(img, `item_${levelId}`)
        itemImageIds.push(id)
        itemImagesResolved.push(img)
      } else {
        itemImagesResolved.push(img)
      }
    }
  }

  const miniLevels = prev.miniLevels.map((m) => {
    if (m.id !== levelId) return m
    const next: FamilyMiniLevel = {
      ...m,
      imageBgId,
      itemImageIds,
      imageBg: imageBgResolved ?? (opts.imageBg === undefined ? m.imageBg : undefined),
      itemImages:
        itemImagesResolved ?? (opts.itemImages === undefined ? m.itemImages : undefined),
    }
    if (!next.imageBgId) delete next.imageBgId
    if (!next.itemImageIds?.length) delete next.itemImageIds
    return next
  })

  const next = { ...prev, miniLevels, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return hydrateFamilyDayImages(next)
}

/** 把 IDB 图 id（及旧 data URL）解析成可显示的 URL，供 UI / 游玩使用 */
export async function hydrateFamilyDayImages(day: FamilyDayRecord): Promise<FamilyDayRecord> {
  const miniLevels = await Promise.all(
    (day.miniLevels || []).map(async (m) => {
      let imageBg = m.imageBg
      let itemImages = m.itemImages ? [...m.itemImages] : undefined
      let imageBgId = m.imageBgId
      let itemImageIds = m.itemImageIds ? [...m.itemImageIds] : undefined
      let dirty = false

      // 旧内联 data URL → 迁入 IDB
      if (imageBg && isInlineImageRef(imageBg) && !imageBgId) {
        try {
          imageBgId = await storeImageDataUrl(imageBg, `bg_${m.id}`)
          dirty = true
        } catch {
          /* keep inline for this session */
        }
      }
      if (itemImages?.some(isInlineImageRef) && !itemImageIds?.length) {
        try {
          itemImageIds = []
          for (const img of itemImages) {
            if (isInlineImageRef(img)) {
              itemImageIds.push(await storeImageDataUrl(img, `item_${m.id}`))
            }
          }
          dirty = true
        } catch {
          /* keep */
        }
      }

      if (imageBgId) {
        imageBg = (await resolveImageRef(imageBgId)) || imageBg
      }
      if (itemImageIds?.length) {
        const resolved: string[] = []
        for (const id of itemImageIds) {
          const url = await resolveImageRef(id)
          if (url) resolved.push(url)
        }
        if (resolved.length) itemImages = resolved
      }

      const out: FamilyMiniLevel = {
        ...m,
        ...(imageBgId ? { imageBgId } : {}),
        ...(itemImageIds?.length ? { itemImageIds } : {}),
        ...(imageBg ? { imageBg } : {}),
        ...(itemImages?.length ? { itemImages } : {}),
      }
      if (dirty) {
        // 回写瘦身后的 id，去掉 data URL
        const store = loadFamilyStore()
        const day2 = store.days[day.date]
        if (day2?.miniLevels) {
          store.days[day.date] = {
            ...day2,
            miniLevels: day2.miniLevels.map((x) =>
              x.id === m.id
                ? slimMiniLevelForPersist({
                    ...x,
                    imageBgId,
                    itemImageIds,
                    imageBg: undefined,
                    itemImages: undefined,
                  })
                : x,
            ),
            updatedAt: Date.now(),
          }
          try {
            saveFamilyStore(store)
          } catch {
            /* ignore */
          }
        }
      }
      return out
    }),
  )

  // legacy day.images：会话内保留；持久化时 slim 会丢掉 data URL
  return { ...day, miniLevels }
}

export function markMiniLevelCompleted(
  date: string,
  levelId: string,
): FamilyDayRecord | null {
  const store = loadFamilyStore()
  const prev = store.days[date]
  if (!prev?.miniLevels?.length) return null
  let found = false
  const miniLevels = prev.miniLevels.map((m) => {
    if (m.id !== levelId) return m
    found = true
    return { ...m, completed: true }
  })
  if (!found) return null
  const completed = miniLevels.every((m) => Boolean(m.completed))
  const next = { ...prev, miniLevels, completed, updatedAt: Date.now() }
  store.days[date] = next
  saveFamilyStore(store)
  return next
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
  if (!prev?.level && !dayHasMiniPack(prev)) return null
  if (dayHasMiniPack(prev)) {
    // legacy helper：整日完成；prefer markMiniLevelCompleted per level
    const miniLevels = (prev.miniLevels || []).map((m) => ({ ...m, completed: true }))
    const next = { ...prev, miniLevels, completed: true, updatedAt: Date.now() }
    store.days[date] = next
    saveFamilyStore(store)
    return next
  }
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

export function getAgnesKey(): string {
  return loadFamilyStore().agnesApiKey
}

export function setAgnesKey(key: string): void {
  const store = loadFamilyStore()
  store.agnesApiKey = key.trim()
  saveFamilyStore(store)
}

export function clearAgnesKey(): void {
  setAgnesKey('')
}

export function getLlmProvider(): FamilyLlmProvider {
  return loadFamilyStore().llmProvider
}

export function setLlmProvider(id: FamilyLlmProvider): void {
  const store = loadFamilyStore()
  store.llmProvider = id
  saveFamilyStore(store)
}

export function getImageCloudProvider(): FamilyImageCloudProvider {
  return loadFamilyStore().imageCloudProvider
}

export function setImageCloudProvider(id: FamilyImageCloudProvider): void {
  const store = loadFamilyStore()
  store.imageCloudProvider = id
  saveFamilyStore(store)
}

export function getLlmApiKey(): string {
  return getLlmProvider() === 'agnes' ? getAgnesKey() : getDeepseekKey()
}

export function getImageCloudApiKey(): string {
  return getImageCloudProvider() === 'agnes' ? getAgnesKey() : getTongyiKey()
}

export function getAutoTongyiImages(): boolean {
  return loadFamilyStore().autoTongyiImages
}

export function setAutoTongyiImages(on: boolean): void {
  const store = loadFamilyStore()
  store.autoTongyiImages = Boolean(on)
  saveFamilyStore(store)
}

function svgPlaceholder(word: string): string {
  const safe = word.replace(/[<>&"']/g, '').slice(0, 24) || 'fun'
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="100%" height="100%" fill="#ffe8c8"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="sans-serif" font-size="88" fill="#5a3d1b">${safe}</text>
    </svg>`,
  )}`
}

/**
 * 对齐官方包节奏：每关第一拍必须是带大图的 introduce（先看图再开口/点选）。
 * LLM 生成的关卡常直接以 find/ask 开头，孩子没看过目标词图片，不知道该说什么。
 */
function ensureIntroBeatFirst(level: LevelScript): void {
  const first = level.beats[0]
  if (first && first.type === 'introduce') {
    if (!first.show) first.show = 'placeholder'
    return
  }
  const word = level.target_words[0] || 'fun'
  level.beats.unshift({
    type: 'introduce',
    show: 'placeholder',
    npc_say: `Look! ${word}!`,
    hint_say: word,
  })
}

/** Apply album/placeholder images onto a copy of the level for play (legacy day) */
export function materializeLevelForPlay(day: FamilyDayRecord): LevelScript {
  if (!day.level) throw new Error('no_level')
  const level = structuredClone(day.level)
  const imgs = day.images
  const placeholder = svgPlaceholder

  const filled = imgs.filter(Boolean).length
  const slots = slotsFromLevel(
    level as unknown as Record<string, unknown>,
    clampImageSlots(filled > 0 ? filled : 9),
  )
  const bg = imgs[0] || placeholder(level.target_words[0] || 'fun')
  level.scene.image = bg
  level.reward.stickerImage = bg

  const resolveWordImage = (word: string) => {
    const hit = imageUrlBySubject(slots, imgs, word)
    if (hit) return hit
    const item = firstItemImage(slots, imgs)
    if (item) return item
    return placeholder(word || 'fun')
  }

  ensureIntroBeatFirst(level)
  level.beats = level.beats.map((beat, bi) => {
    const word = beat.expect?.[0] || level.target_words[bi % level.target_words.length] || 'fun'
    // introduce / ask 拍必须有图（对齐官方包）：孩子先看图，才知道要说什么
    const showRef = beat.show || (beat.type !== 'find' ? 'placeholder' : undefined)
    const show = showRef ? resolveWordImage(beat.expect?.[0] || word) : undefined
    const mapOpts = (opts?: { id: string; image: string; correct: boolean }[]) =>
      opts?.map((o) => ({
        ...o,
        image: resolveWordImage(o.id || word),
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
  return shuffleLevelOptions(level)
}

/** Materialize one mini-pack level for play */
export function materializeMiniLevelForPlay(
  day: FamilyDayRecord,
  levelId: string,
): LevelScript {
  const mini = day.miniLevels?.find((m) => m.id === levelId)
  if (!mini) throw new Error('no_mini_level')
  const level = structuredClone(mini.level)
  const mainWord = level.target_words[0] || 'fun'
  const scenePrompt = effectiveScenePrompt(mini)
  const slots = slotsForMiniLevel(level as unknown as Record<string, unknown>, scenePrompt, 5)
  const images = [mini.imageBg || '', ...(mini.itemImages || [])]
  const bg = images[0] || svgPlaceholder(mainWord)
  level.scene.image = bg
  level.reward.stickerImage = bg

  const resolveWordImage = (word: string) => {
    const hit = imageUrlBySubject(slots, images, word)
    if (hit) return hit
    const w = word.trim().toLowerCase()
    if (w === mainWord.toLowerCase()) {
      const item = firstItemImage(slots, images)
      if (item) return item
      // 没生成道具图时退回背景图：场景里通常画着目标物，好过文字占位
      if (images[0]) return images[0]
    }
    // 其它关同词可复用（同日迷你包）
    const other = day.miniLevels?.find(
      (m) => (m.level.target_words[0] || '').toLowerCase() === w && (m.imageBg || m.itemImages?.[0]),
    )
    if (other?.itemImages?.[0] && (other.level.target_words[0] || '').toLowerCase() === w) {
      return other.itemImages[0]
    }
    if (other?.imageBg) return other.imageBg
    return svgPlaceholder(word || 'fun')
  }

  ensureIntroBeatFirst(level)
  level.beats = level.beats.map((beat, bi) => {
    const word = beat.expect?.[0] || level.target_words[bi % level.target_words.length] || 'fun'
    // introduce / ask 拍必须有图（对齐官方包）：孩子先看图，才知道要说什么
    const showRef = beat.show || (beat.type !== 'find' ? 'placeholder' : undefined)
    const show = showRef ? resolveWordImage(beat.expect?.[0] || word) : undefined
    const mapOpts = (opts?: { id: string; image: string; correct: boolean }[]) =>
      opts?.map((o) => ({
        ...o,
        image: resolveWordImage(o.id || word),
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
  return shuffleLevelOptions(level)
}

export function effectiveScenePrompt(mini: FamilyMiniLevel): string {
  const custom = mini.scenePrompt?.trim()
  if (custom) return custom
  return String(mini.level.scene?.setting || mini.level.target_words?.[0] || 'playground')
}
