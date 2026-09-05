export type ImageSlot = {
  subject: string
  role?: 'scene' | 'item'
}

/** 含 CJK/谚文/假名等非拉丁脚本时需要翻译成英文再喂给图片模型 */
export function sceneNeedsTranslation(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // 正向匹配非拉丁文字区段：希腊/西里尔/希伯来/阿拉伯/天城文/泰文/假名/谚文/CJK/全角标点
  return /[\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3130-\u318f\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\uff00-\uffef]/u.test(
    t,
  )
}

const SAFETY_PREFIX =
  '儿童绘本插画，厚实友好描边，扁平柔和暖色，温暖明亮，画面简洁干净，适合4到6岁儿童，画面中绝对不要出现任何文字、字母、数字、招牌或标志，无水印，无暴力恐怖血腥，正方形构图，'

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
    return `${SAFETY_PREFIX}作为游戏主场景的远景环境背景，开阔画面，展示地点与氛围，道具少量点缀即可，不要出现任何巨大招牌或横幅，主题：${subject}`
  }
  return `${SAFETY_PREFIX}画面中心只画一个主体：${subject}，居中且占画面约七成，周围是干净的浅色柔和纯色背景，无其它物体、无场景元素、无装饰边框`
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

/**
 * 迷你关配图槽：场景用可编辑 scenePrompt，道具含目标词 + picture_choice 选项
 *（确保 fork 等干扰项也有独立插画，而不是文字占位）。
 * 默认 1 背景 + 4 道具：覆盖主词 + find/ask 的全部干扰项。
 */
export function slotsForMiniLevel(
  level: Record<string, unknown>,
  scenePrompt: string,
  maxSlots = 5,
): ImageSlot[] {
  const max = clampImageSlots(maxSlots)
  const scene = level.scene && typeof level.scene === 'object' ? { ...(level.scene as object) } : {}
  const setting = scenePrompt.trim() || String((scene as { setting?: unknown }).setting || '')
  return slotsFromLevel(
    {
      ...level,
      scene: { ...scene, setting: setting || 'playground' },
    },
    max,
  )
}

/** 迷你关是否还缺背景或任一选项道具图 */
export function miniLevelMissingImageSlots(
  level: Record<string, unknown>,
  scenePrompt: string,
  imageBg: string | undefined,
  itemImages: string[] | undefined,
  maxSlots = 5,
): ImageSlot[] {
  const slots = slotsForMiniLevel(level, scenePrompt, maxSlots)
  const images = [imageBg, ...(itemImages || [])].map((u) => u || '')
  const missing: ImageSlot[] = []
  for (let i = 0; i < slots.length; i++) {
    if (!images[i]) missing.push(slots[i]!)
  }
  return missing
}
