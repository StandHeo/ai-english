export type ImageSlot = {
  subject: string
  role?: 'scene' | 'item'
}

const SAFETY_PREFIX =
  '儿童绘本插画，温暖明亮，简单卡通，统一友好绘本画风，可含一只可爱卡通兔角色氛围，适合4到6岁儿童，无文字水印，无暴力恐怖血腥，正方形构图，'

export function clampImageSlots(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 9
  return Math.min(12, Math.max(3, Math.floor(v)))
}

/** 槽位 / 选项匹配用的规范化键 */
export function slotSubjectKey(subject: string): string {
  return subject.trim().toLowerCase()
}

export function buildKidsPrompt(slot: ImageSlot): string {
  const subject = slot.subject.trim()
  if (slot.role === 'scene') {
    return `${SAFETY_PREFIX}作为游戏主场景的环境全景背景，开阔画面，展示地点与氛围，不要把单个巨大道具放在画面正中，主题：${subject}`
  }
  return `${SAFETY_PREFIX}作为儿童英语游戏中的单个道具或对象，居中，主题：${subject}`
}

function sceneSettingOf(level: Record<string, unknown>): string {
  const scene = level.scene
  if (!scene || typeof scene !== 'object') return ''
  return String((scene as { setting?: unknown }).setting || '').trim()
}

/**
 * 配图槽位：首位固定为 scene（优先 scene.setting），其余为 target_words / 选项 id。
 * 总张数上限 maxSlots = 1 背景 + 最多 maxSlots-1 道具。
 */
export function slotsFromLevel(level: Record<string, unknown>, maxSlots?: number): ImageSlot[] {
  const max = clampImageSlots(maxSlots)
  const words = Array.isArray(level.target_words)
    ? level.target_words.map(String).filter((w) => w.trim())
    : []
  const setting = sceneSettingOf(level)
  const sceneSubject = setting || words[0]?.trim() || 'playground'

  const slots: ImageSlot[] = [{ subject: sceneSubject, role: 'scene' }]
  const seen = new Set<string>([slotSubjectKey(sceneSubject)])

  const pushItem = (raw: string) => {
    if (slots.length >= max) return
    const subject = raw.trim()
    if (!subject) return
    const key = slotSubjectKey(subject)
    if (seen.has(key)) return
    seen.add(key)
    slots.push({ subject, role: 'item' })
  }

  for (const w of words) pushItem(w)

  const beats = Array.isArray(level.beats) ? level.beats : []
  for (const raw of beats) {
    if (slots.length >= max) break
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    let opts: unknown[] = []
    if (Array.isArray(b.options)) opts = b.options
    else if (b.fallback && typeof b.fallback === 'object') {
      const fb = (b.fallback as { options?: unknown }).options
      if (Array.isArray(fb)) opts = fb
    }
    for (const o of opts) {
      if (slots.length >= max) break
      if (!o || typeof o !== 'object') continue
      pushItem(String((o as { id?: string }).id || ''))
    }
  }

  return slots.slice(0, max)
}

/** 按槽位顺序，把 subject 映射到对应 images[i] */
export function imageUrlBySubject(
  slots: ImageSlot[],
  images: string[],
  subject: string,
): string | undefined {
  const key = slotSubjectKey(subject)
  if (!key) return undefined
  const idx = slots.findIndex((s) => slotSubjectKey(s.subject) === key)
  if (idx >= 0 && images[idx]) return images[idx]
  return undefined
}

/** 第一个有图的道具槽（跳过背景） */
export function firstItemImage(slots: ImageSlot[], images: string[]): string | undefined {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]?.role === 'scene') continue
    if (images[i]) return images[i]
  }
  return undefined
}

/** 根据已有 images 长度，算出还缺哪些槽位（保留已有图，只补空位） */
export function missingSlotsForImages(
  level: Record<string, unknown>,
  existingImages: string[],
  maxSlots?: number,
): ImageSlot[] {
  const slots = slotsFromLevel(level, maxSlots)
  const filled = existingImages.filter(Boolean).length
  if (filled >= slots.length) return []
  return slots.slice(filled)
}
