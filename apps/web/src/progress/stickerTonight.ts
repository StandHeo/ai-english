/** 贴纸「今晚新得」——与 progress 解耦的轻量日期标记。 */

const KEY = 'ai-english-sticker-earned-at-v1'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function markStickerEarnedTonight(stickerId: string): void {
  if (!stickerId) return
  const map = loadMap()
  map[stickerId] = todayKey()
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function isStickerEarnedTonight(stickerId: string): boolean {
  return loadMap()[stickerId] === todayKey()
}

export function tonightStickerIds(): string[] {
  const today = todayKey()
  return Object.entries(loadMap())
    .filter(([, d]) => d === today)
    .map(([id]) => id)
}
