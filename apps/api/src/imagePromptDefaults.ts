/**
 * 家庭关卡配图提示词的内置默认。
 * keep in sync with apps/web/src/family/imagePromptDefaults.ts
 *
 * 负向词默认不禁用兔子，避免和儿童绘本风格冲突。
 */

export const IMAGE_PROMPT_CONFIG_VERSION = 1

export const DEFAULT_SAFETY_PREFIX =
  '儿童绘本插画，厚实友好描边，扁平柔和暖色，温暖明亮，画面简洁干净，适合4到6岁儿童，画面中绝对不要出现任何文字、字母、数字、招牌或标志，无水印，无暴力恐怖血腥，'

export const DEFAULT_SCENE_TEMPLATE =
  '竖版竖构图的游戏背景，画面偏高适合手机封面，开阔的远景环境，道具只作少量点缀，不要巨大招牌或横幅，主题：{subject}'

export const DEFAULT_ITEM_TEMPLATE =
  '单词闪卡，画面中心只画一个主体：{subject}，居中且占画面约七成，周围是干净的浅色柔和纯色背景，无其它物体、无场景元素、无装饰边框'

export const DEFAULT_DISTRACTOR_TEMPLATE =
  '单词闪卡，画面中心只画一个主体：{subject}，居中且占画面约七成，周围是干净的浅色柔和纯色背景，无其它物体、无场景元素、无装饰边框，不要画成或看起来像{targetWord}'

export const DEFAULT_NEGATIVE_PROMPT =
  '文字,字母,数字,乱码,招牌,标志,水印,签名,暴力,恐怖,血腥,写实照片,成人内容,畸形,低清晰度'

export type ImagePromptConfig = {
  version: number
  safetyPrefix: string
  sceneTemplate: string
  itemTemplate: string
  distractorTemplate: string
  negativePrompt: string
  updatedAt?: string
}

export type PromptSlot = {
  subject: string
  role?: 'scene' | 'item'
  /** 干扰图。缺省时由一批槽位里的第一张道具视为主词。 */
  distractor?: boolean
  /** 干扰图要避开的主词。 */
  targetWord?: string
}

export type RenderKidsPromptOpts = {
  targetWord?: string
  distractor?: boolean
  config?: ImagePromptConfig
}

const BAKED: ImagePromptConfig = {
  version: IMAGE_PROMPT_CONFIG_VERSION,
  safetyPrefix: DEFAULT_SAFETY_PREFIX,
  sceneTemplate: DEFAULT_SCENE_TEMPLATE,
  itemTemplate: DEFAULT_ITEM_TEMPLATE,
  distractorTemplate: DEFAULT_DISTRACTOR_TEMPLATE,
  negativePrompt: DEFAULT_NEGATIVE_PROMPT,
}

export const DEFAULT_IMAGE_PROMPT_CONFIG: ImagePromptConfig = BAKED

export function defaultImagePromptConfig(): ImagePromptConfig {
  return { ...BAKED }
}

export type PromptFieldError =
  | 'invalid_image_prompt_config'
  | 'safety_prefix_required'
  | 'scene_template_required'
  | 'item_template_required'
  | 'distractor_template_required'
  | 'negative_prompt_required'
  | 'scene_template_missing_subject'
  | 'item_template_missing_subject'
  | 'distractor_template_missing_subject'

export type PromptTemplateFields = {
  safetyPrefix: string
  sceneTemplate: string
  itemTemplate: string
  distractorTemplate: string
  negativePrompt: string
}

export function readPromptTemplateFields(
  raw: unknown,
): { ok: true; fields: PromptTemplateFields } | { ok: false; error: PromptFieldError } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_image_prompt_config' }
  const o = raw as Record<string, unknown>
  const safetyPrefix = typeof o.safetyPrefix === 'string' ? o.safetyPrefix.trim() : ''
  const sceneTemplate = typeof o.sceneTemplate === 'string' ? o.sceneTemplate.trim() : ''
  const itemTemplate = typeof o.itemTemplate === 'string' ? o.itemTemplate.trim() : ''
  const distractorTemplate = typeof o.distractorTemplate === 'string' ? o.distractorTemplate.trim() : ''
  const negativePrompt = typeof o.negativePrompt === 'string' ? o.negativePrompt.trim() : ''
  if (!safetyPrefix) return { ok: false, error: 'safety_prefix_required' }
  if (!sceneTemplate) return { ok: false, error: 'scene_template_required' }
  if (!itemTemplate) return { ok: false, error: 'item_template_required' }
  if (!distractorTemplate) return { ok: false, error: 'distractor_template_required' }
  if (!negativePrompt) return { ok: false, error: 'negative_prompt_required' }
  if (!sceneTemplate.includes('{subject}')) return { ok: false, error: 'scene_template_missing_subject' }
  if (!itemTemplate.includes('{subject}')) return { ok: false, error: 'item_template_missing_subject' }
  if (!distractorTemplate.includes('{subject}')) {
    return { ok: false, error: 'distractor_template_missing_subject' }
  }
  return {
    ok: true,
    fields: { safetyPrefix, sceneTemplate, itemTemplate, distractorTemplate, negativePrompt },
  }
}

export function parseImagePromptConfig(raw: unknown): ImagePromptConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const version = Number((raw as { version?: unknown }).version)
  if (!Number.isInteger(version) || version < 1) return null
  const fields = readPromptTemplateFields(raw)
  if (!fields.ok) return null
  const updatedRaw = (raw as { updatedAt?: unknown }).updatedAt
  const updatedAt = typeof updatedRaw === 'string' ? updatedRaw.trim() : ''
  return {
    version,
    ...fields.fields,
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function slotKey(subject: string): string {
  return subject.trim().toLowerCase()
}

/** targetWord 为空时去掉含 {targetWord} 的那一分句。 */
export function fillPromptPlaceholders(template: string, subject: string, targetWord: string): string {
  const word = targetWord.trim()
  let body = template
  if (!word) {
    body = body.replace(/[，,；;]\s*[^，,。；;]*\{targetWord\}[^，,。；;]*/g, '')
    body = body.replaceAll('{targetWord}', '')
  } else {
    body = body.replaceAll('{targetWord}', word)
  }
  return body.replaceAll('{subject}', subject.trim()).replace(/\s+/g, ' ').trim()
}

export function joinSafetyPrefix(prefix: string, body: string): string {
  const p = prefix.trim()
  const b = body.trim()
  if (!p) return b
  if (!b) return p
  const sep = /[，,。；;、！!？?]$/.test(p) ? '' : '，'
  return `${p}${sep}${b}`
}

export function renderKidsPrompt(slot: PromptSlot, opts: RenderKidsPromptOpts = {}): string {
  const config = opts.config ?? defaultImagePromptConfig()
  const subject = slot.subject.trim()
  if (slot.role === 'scene') {
    return joinSafetyPrefix(config.safetyPrefix, fillPromptPlaceholders(config.sceneTemplate, subject, ''))
  }
  const distractor = opts.distractor ?? slot.distractor === true
  const targetWord = (opts.targetWord ?? (distractor ? slot.targetWord : '') ?? '').trim()
  const template = distractor ? config.distractorTemplate : config.itemTemplate
  const word =
    distractor && targetWord && slotKey(targetWord) !== slotKey(subject) ? targetWord : ''
  return joinSafetyPrefix(config.safetyPrefix, fillPromptPlaceholders(template, subject, word))
}

export function renderPromptAt(slots: PromptSlot[], index: number, config?: ImagePromptConfig): string {
  const slot = slots[index]
  if (!slot) return ''
  if (slot.role === 'scene') return renderKidsPrompt(slot, { config, distractor: false })
  if (slot.distractor === true) {
    const mainIndex = slots.findIndex((s) => s.role !== 'scene' && s.distractor !== true)
    const inferred = mainIndex >= 0 ? slots[mainIndex]!.subject : ''
    return renderKidsPrompt(slot, {
      config,
      distractor: true,
      targetWord: slot.targetWord || inferred,
    })
  }
  if (slot.distractor === false) return renderKidsPrompt(slot, { config, distractor: false })
  const mainIndex = slots.findIndex((s) => s.role !== 'scene')
  const distractor = mainIndex >= 0 && index !== mainIndex
  return renderKidsPrompt(slot, {
    config,
    distractor,
    targetWord: distractor ? slots[mainIndex]!.subject : '',
  })
}
