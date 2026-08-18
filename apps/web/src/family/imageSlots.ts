export type ImageSlot = {
  subject: string
  role?: 'scene' | 'item'
}

const SAFETY_PREFIX =
  '儿童绘本插画，温暖明亮，简单卡通，适合4到6岁儿童，无文字水印，无暴力恐怖血腥，正方形构图，'

export function clampImageSlots(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 9
  return Math.min(12, Math.max(3, Math.floor(v)))
}

export function buildKidsPrompt(slot: ImageSlot): string {
  const roleHint =
    slot.role === 'scene'
      ? '作为游戏主场景背景，'
      : '作为儿童英语游戏中的单个道具或对象，居中，'
  return `${SAFETY_PREFIX}${roleHint}主题：${slot.subject.trim()}`
}

export function slotsFromLevel(level: Record<string, unknown>, maxSlots?: number): ImageSlot[] {
  const max = clampImageSlots(maxSlots)
  const slots: ImageSlot[] = []
  const words = Array.isArray(level.target_words)
    ? level.target_words.map(String).filter(Boolean)
    : []

  for (const w of words) {
    if (slots.length >= max) break
    if (slots.some((s) => s.subject.toLowerCase() === w.toLowerCase())) continue
    slots.push({ subject: w, role: slots.length === 0 ? 'scene' : 'item' })
  }

  const beats = Array.isArray(level.beats) ? level.beats : []
  for (const raw of beats) {
    if (slots.length >= max) break
    const b = raw as Record<string, unknown>
    let opts: unknown[] = []
    if (Array.isArray(b.options)) opts = b.options
    else if (b.fallback && typeof b.fallback === 'object') {
      const fb = (b.fallback as { options?: unknown }).options
      if (Array.isArray(fb)) opts = fb
    }
    for (const o of opts) {
      if (slots.length >= max) break
      const id = String((o as { id?: string })?.id || '').trim()
      if (!id) continue
      if (slots.some((s) => s.subject.toLowerCase() === id.toLowerCase())) continue
      slots.push({ subject: id, role: 'item' })
    }
  }

  return slots.slice(0, max)
}
