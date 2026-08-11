import type { PackProgress, ProgressState } from '../types'

const KEY = 'ai-english-progress-v2'
const LEGACY_KEY = 'ai-english-progress-v1'

const FRUIT = 'fruit-forest'
const BIKE = 'bike-world'
const ROBOT = 'robot-lab'
const HERO = 'hero-world'
const PUP = 'pup-patrol'
const FISH = 'fishing-day'
const SWIM = 'swim-day'

const FIRST_LEVEL: Record<string, string> = {
  [FRUIT]: 'fruit-01-apple',
  [BIKE]: 'bike-01-bike',
  [ROBOT]: 'robot-01-robot',
  [HERO]: 'hero-01-hero',
  [PUP]: 'pup-01-pup',
  [FISH]: 'fish-01-fish',
  [SWIM]: 'swim-01-pool',
}

function emptyPack(firstLevelId: string): PackProgress {
  return { completed: [], unlocked: [firstLevelId], stickers: [] }
}

function firstLevelFor(packId: string): string {
  return FIRST_LEVEL[packId] || 'fruit-01-apple'
}

const defaultState = (): ProgressState => ({
  version: 2,
  packs: {
    [FRUIT]: emptyPack(FIRST_LEVEL[FRUIT]),
    [BIKE]: emptyPack(FIRST_LEVEL[BIKE]),
    [ROBOT]: emptyPack(FIRST_LEVEL[ROBOT]),
    [HERO]: emptyPack(FIRST_LEVEL[HERO]),
    [PUP]: emptyPack(FIRST_LEVEL[PUP]),
    [FISH]: emptyPack(FIRST_LEVEL[FISH]),
    [SWIM]: emptyPack(FIRST_LEVEL[SWIM]),
  },
  stars: 0,
  dailyLimitMinutes: 30,
  playSecondsByDate: {},
})

function migrateLegacy(raw: Record<string, unknown>): ProgressState {
  const base = defaultState()
  const completed = Array.isArray(raw.completed) ? (raw.completed as string[]) : []
  const unlocked = Array.isArray(raw.unlocked) ? (raw.unlocked as string[]) : ['fruit-01-apple']
  const stickers = Array.isArray(raw.stickers) ? (raw.stickers as string[]) : []
  base.packs[FRUIT] = {
    completed: completed.filter((id) => id.startsWith('fruit-')),
    unlocked: unlocked.filter((id) => id.startsWith('fruit-')).length
      ? unlocked.filter((id) => id.startsWith('fruit-'))
      : ['fruit-01-apple'],
    stickers,
  }
  // Drop fruit-09-bike from migrated unlock if present; picnic may already be unlocked
  base.packs[FRUIT].unlocked = base.packs[FRUIT].unlocked.filter((id) => id !== 'fruit-09-bike')
  base.packs[FRUIT].completed = base.packs[FRUIT].completed.filter((id) => id !== 'fruit-09-bike')
  if (
    base.packs[FRUIT].completed.includes('fruit-07-pear') &&
    !base.packs[FRUIT].unlocked.includes('fruit-08-picnic')
  ) {
    base.packs[FRUIT].unlocked.push('fruit-08-picnic')
  }
  base.stars = typeof raw.stars === 'number' ? raw.stars : 0
  base.dailyLimitMinutes =
    raw.dailyLimitMinutes === null || typeof raw.dailyLimitMinutes === 'number'
      ? (raw.dailyLimitMinutes as number | null)
      : 30
  base.playSecondsByDate =
    raw.playSecondsByDate && typeof raw.playSecondsByDate === 'object'
      ? (raw.playSecondsByDate as Record<string, number>)
      : {}
  return base
}

export function loadProgress(): ProgressState {
  try {
    const v2 = localStorage.getItem(KEY)
    if (v2) {
      const parsed = JSON.parse(v2) as ProgressState
      const base = defaultState()
      return {
        ...base,
        ...parsed,
        version: 2,
        packs: { ...base.packs, ...(parsed.packs || {}) },
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const migrated = migrateLegacy(JSON.parse(legacy) as Record<string, unknown>)
      saveProgress(migrated)
      return migrated
    }
    return defaultState()
  } catch {
    return defaultState()
  }
}

export function saveProgress(state: ProgressState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function getPackProgress(state: ProgressState, packId: string): PackProgress {
  return state.packs[packId] || emptyPack(firstLevelFor(packId))
}

export function allStickers(state: ProgressState): string[] {
  return Object.values(state.packs).flatMap((p) => p.stickers)
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getTodayPlaySeconds(state: ProgressState): number {
  return state.playSecondsByDate[todayKey()] || 0
}

export function isDailyLimitReached(state: ProgressState): boolean {
  if (state.dailyLimitMinutes == null) return false
  return getTodayPlaySeconds(state) >= state.dailyLimitMinutes * 60
}

export function addPlaySeconds(state: ProgressState, seconds: number): ProgressState {
  const key = todayKey()
  const next = {
    ...state,
    playSecondsByDate: {
      ...state.playSecondsByDate,
      [key]: (state.playSecondsByDate[key] || 0) + Math.max(0, Math.floor(seconds)),
    },
  }
  saveProgress(next)
  return next
}

export function completeLevel(
  state: ProgressState,
  packId: string,
  levelId: string,
  nextLevelId: string | undefined,
  stickerId: string,
  stars: number,
): ProgressState {
  const pack = { ...getPackProgress(state, packId) }
  const already = pack.completed.includes(levelId)
  const completed = already ? pack.completed : [...pack.completed, levelId]
  const unlocked = new Set(pack.unlocked)
  unlocked.add(levelId)
  if (nextLevelId) unlocked.add(nextLevelId)
  const stickers = pack.stickers.includes(stickerId)
    ? pack.stickers
    : [...pack.stickers, stickerId]
  const next: ProgressState = {
    ...state,
    packs: {
      ...state.packs,
      [packId]: {
        completed,
        unlocked: [...unlocked],
        stickers,
      },
    },
    stars: state.stars + (already ? 0 : stars),
  }
  saveProgress(next)
  return next
}

export function updateSettings(
  state: ProgressState,
  patch: Partial<Pick<ProgressState, 'dailyLimitMinutes'>>,
): ProgressState {
  const next = { ...state, ...patch }
  saveProgress(next)
  return next
}

export const PACK_IDS = { FRUIT, BIKE, ROBOT, HERO, PUP, FISH, SWIM } as const

export const PACK_LABELS_ZH: Record<string, string> = {
  [FRUIT]: '水果森林',
  [BIKE]: '自行车世界',
  [ROBOT]: '机器人实验室',
  [HERO]: '英雄世界',
  [PUP]: '小狗救援队',
  [FISH]: '钓鱼日',
  [SWIM]: '游泳日',
}
