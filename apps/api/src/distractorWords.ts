import { slotSubjectKey } from './slotSubject.ts'

/** 不宜单独当配图主体的抽象/劣质干扰词（经规范化键匹配）。 */
export const ABSTRACT_DISTRACTOR_KEYS = new Set([
  'paper',
  'square',
  'circle',
  'triangle',
  'rectangle',
  'shape',
  'color',
  'colour',
  'number',
  'letter',
])

/** 具体童词池，用于替换抽象干扰项。 */
export const KID_NOUN_POOL = [
  'bus',
  'cake',
  'home',
  'tree',
  'duck',
  'ball',
  'slide',
  'park',
  'friend',
  'apple',
  'banana',
  'kite',
  'dog',
  'cat',
  'cup',
  'hat',
  'shoe',
  'fish',
  'flower',
  'car',
  'bike',
  'star',
] as const

export function isAbstractDistractorId(id: string): boolean {
  const key = slotSubjectKey(id)
  return Boolean(key) && ABSTRACT_DISTRACTOR_KEYS.has(key)
}

export function nextKidNoun(used: Set<string>): string | null {
  for (const word of KID_NOUN_POOL) {
    const key = slotSubjectKey(word)
    if (!used.has(key)) return word
  }
  return null
}

function collectOptionObjects(level: Record<string, unknown>): Array<{ id?: unknown; draw?: unknown }> {
  const out: Array<{ id?: unknown; draw?: unknown }> = []
  const beats = Array.isArray(level.beats) ? level.beats : []
  for (const raw of beats) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    let opts: unknown[] = []
    if (Array.isArray(b.options)) opts = b.options
    else if (b.fallback && typeof b.fallback === 'object') {
      const fb = (b.fallback as { options?: unknown }).options
      if (Array.isArray(fb)) opts = fb
    }
    for (const o of opts) {
      if (o && typeof o === 'object') out.push(o as { id?: unknown; draw?: unknown })
    }
  }
  return out
}

export function collectUsedNounKeys(level: Record<string, unknown>): Set<string> {
  const used = new Set<string>()
  const words = Array.isArray(level.target_words) ? level.target_words : []
  for (const w of words) {
    const key = slotSubjectKey(String(w))
    if (key) used.add(key)
  }
  for (const o of collectOptionObjects(level)) {
    const key = slotSubjectKey(String(o.id || ''))
    if (key) used.add(key)
  }
  return used
}

/**
 * 把抽象干扰 option id 换成当日未用的具体童词。不改主词 target_words[0]。
 * 无法补足时抛 abstract_distractors_exhausted。
 */
export function sanitizeLevelDistractors(level: Record<string, unknown>, used: Set<string>): void {
  const mainKey = slotSubjectKey(String(Array.isArray(level.target_words) ? level.target_words[0] : ''))
  for (const o of collectOptionObjects(level)) {
    const raw = String(o.id || '')
    const key = slotSubjectKey(raw)
    if (!key || key === mainKey || !isAbstractDistractorId(raw)) continue
    used.delete(key)
    const next = nextKidNoun(used)
    if (!next) throw new Error('abstract_distractors_exhausted')
    o.id = next
    delete o.draw
    used.add(slotSubjectKey(next))
  }
}
