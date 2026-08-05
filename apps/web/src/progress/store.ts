import type { ProgressState } from '../types'

const KEY = 'ai-english-progress-v1'

const defaultState = (): ProgressState => ({
  completed: [],
  unlocked: ['fruit-01-apple'],
  stickers: [],
  stars: 0,
  dailyLimitMinutes: 30,
  playSecondsByDate: {},
})

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    return defaultState()
  }
}

export function saveProgress(state: ProgressState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
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
  levelId: string,
  nextLevelId: string | undefined,
  stickerId: string,
  stars: number,
): ProgressState {
  const completed = state.completed.includes(levelId)
    ? state.completed
    : [...state.completed, levelId]
  const unlocked = new Set(state.unlocked)
  unlocked.add(levelId)
  if (nextLevelId) unlocked.add(nextLevelId)
  const stickers = state.stickers.includes(stickerId)
    ? state.stickers
    : [...state.stickers, stickerId]
  const next: ProgressState = {
    ...state,
    completed,
    unlocked: [...unlocked],
    stickers,
    stars: state.stars + (completed ? 0 : stars),
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
