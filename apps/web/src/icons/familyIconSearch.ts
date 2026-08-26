import {
  clampImageSlots,
  slotsFromLevel as slotsFromLevelShared,
  type ImageSlot,
} from '../family/imageSlots'
import pack from '../icons/familyIconPack.json'

export type IconPack = {
  prefix: string
  width: number
  height: number
  aliases: Record<string, string>
  icons: Record<string, { body: string; width?: number; height?: number }>
}

const data = pack as IconPack

export type IconSlot = ImageSlot

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, '-')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidatesFromSubject(subject: string): string[] {
  const key = normalizeKey(subject)
  if (!key) return []
  const parts = key.split(/[\s-]+/).filter(Boolean)
  const out: string[] = [key.replace(/\s+/g, '-'), key.replace(/\s+/g, ''), ...parts]
  // 中文场景：抽不出英文时，用通用场景词
  if (!/[a-z]/.test(key)) {
    out.push('tree', 'forest', 'image-filter-hdr', 'star')
  }
  return [...new Set(out)]
}

function scoreName(query: string, name: string): number {
  if (name === query) return 100
  if (name.startsWith(query + '-') || name.endsWith('-' + query)) return 80
  if (name.includes(query)) return 50
  const qParts = query.split('-')
  if (qParts.every((p) => p.length > 1 && name.includes(p))) return 40
  return 0
}

/** 按关键词在本地包中找最佳图标名；找不到返回 null */
export function findIconName(subject: string): string | null {
  const aliases = data.aliases || {}
  for (const c of candidatesFromSubject(subject)) {
    const mapped = aliases[c] || aliases[c.replace(/-/g, '')]
    if (mapped && data.icons[mapped]) return mapped
  }

  let best: { name: string; score: number } | null = null
  for (const c of candidatesFromSubject(subject)) {
    for (const name of Object.keys(data.icons)) {
      const s = scoreName(c, name)
      if (s <= 0) continue
      if (!best || s > best.score) best = { name, score: s }
    }
  }
  return best && best.score >= 40 ? best.name : null
}

const SCENE_ICON_FALLBACKS = [
  'image-filter-hdr',
  'forest',
  'pine-tree',
  'tree',
  'nature',
  'landscape',
  'flower',
]

function findSceneIconName(subject: string): string | null {
  const direct = findIconName(subject)
  if (direct) return direct
  for (const name of SCENE_ICON_FALLBACKS) {
    if (data.icons[name]) return name
    const via = findIconName(name)
    if (via) return via
  }
  const first = Object.keys(data.icons)[0]
  return first || null
}

/** 儿童向温馨配色：浅底 + 柔和主色（可按词轮换） */
const KID_PALETTE = [
  { bg: '#FFF3E0', fg: '#E07A3D', caption: '#8B5A2B' }, // 暖橙
  { bg: '#FFE8F0', fg: '#E06B8A', caption: '#9A4A5C' }, // 蜜桃粉
  { bg: '#E8F6EE', fg: '#3D9B6E', caption: '#2F6B4A' }, // 草绿
  { bg: '#E8F2FF', fg: '#5B8FD9', caption: '#3D5A80' }, // 天空蓝
  { bg: '#FFF8E1', fg: '#D4A017', caption: '#8A6D1A' }, // 阳光黄
  { bg: '#F3E8FF', fg: '#9B6BC9', caption: '#5E3F7A' }, // 浅紫
] as const

function paletteForLabel(label: string): (typeof KID_PALETTE)[number] {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return KID_PALETTE[h % KID_PALETTE.length]
}

export function iconToDataUrl(
  iconName: string,
  label?: string,
  colors?: { bg?: string; fg?: string; caption?: string },
): string | null {
  const icon = data.icons[iconName]
  if (!icon?.body) return null
  const w = icon.width || data.width || 24
  const h = icon.height || data.height || 24
  const caption = (label || iconName).replace(/[<>&"']/g, '').slice(0, 18)
  const pal = paletteForLabel(caption)
  const bg = colors?.bg || pal.bg
  const fg = colors?.fg || pal.fg
  const cap = colors?.caption || pal.caption
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 112">
  <rect width="100" height="100" rx="12" fill="${bg}"/>
  <svg x="18" y="14" width="64" height="64" viewBox="0 0 ${w} ${h}" fill="${fg}">${icon.body}</svg>
  <text x="50" y="108" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="${cap}">${caption}</text>
</svg>`.replace(/\n\s*/g, '')
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function slotsFromLevel(
  level: {
    target_words?: string[]
    scene?: { setting?: string }
    beats?: unknown[]
  },
  maxSlots = 9,
): IconSlot[] {
  return slotsFromLevelShared(level as Record<string, unknown>, clampImageSlots(maxSlots))
}

export type IconImagesResult = {
  slots: IconSlot[]
  /** 仅成功匹配的图（顺序与匹配成功的槽位一致，用于写入） */
  images: string[]
  matched: string[]
  missed: string[]
  /** 需要通义补全的槽位 */
  missedSlots: IconSlot[]
}

function colorsForSubject(
  subject: string,
  hints?: { word: string; fg: string; bg: string }[],
): { bg?: string; fg?: string } | undefined {
  if (!hints?.length) return undefined
  const key = subject.trim().toLowerCase()
  const hit =
    hints.find((h) => h.word === key) ||
    hints.find((h) => key.includes(h.word) || h.word.includes(key))
  if (!hit) return undefined
  return { fg: hit.fg, bg: hit.bg }
}

/** 本地为关卡槽位生成图标 data URL（张数由 maxSlots 控制） */
export function generateIconImagesForLevel(
  level: {
    target_words?: string[]
    scene?: { setting?: string }
    beats?: unknown[]
  },
  iconColors?: { word: string; fg: string; bg: string }[],
  maxSlots = 9,
): IconImagesResult {
  const slots = slotsFromLevel(level, maxSlots)
  const images: string[] = []
  const matched: string[] = []
  const missed: string[] = []
  const missedSlots: IconSlot[] = []

  for (const slot of slots) {
    const name =
      slot.role === 'scene' ? findSceneIconName(slot.subject) : findIconName(slot.subject)
    if (!name) {
      missed.push(slot.subject)
      missedSlots.push(slot)
      // 背景槽必须占位，避免后续索引错位
      if (slot.role === 'scene') {
        const ph = iconToDataUrl(
          Object.keys(data.icons)[0] || 'star',
          slot.subject.slice(0, 18) || 'scene',
          colorsForSubject(slot.subject, iconColors),
        )
        images.push(ph || `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`)
        matched.push(`${slot.subject}→scene-placeholder`)
      }
      continue
    }
    const url = iconToDataUrl(name, slot.subject, colorsForSubject(slot.subject, iconColors))
    if (!url) {
      missed.push(slot.subject)
      missedSlots.push(slot)
      if (slot.role === 'scene') {
        images.push(`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`)
        matched.push(`${slot.subject}→scene-placeholder`)
      }
      continue
    }
    images.push(url)
    matched.push(`${slot.subject}→${name}`)
  }

  return { slots, images, matched, missed, missedSlots }
}

/** 根据已有 images 长度，算出还缺哪些槽位（保留已有图，只补空位） */
export function missingSlotsForImages(
  level: {
    target_words?: string[]
    scene?: { setting?: string }
    beats?: unknown[]
  },
  existingImages: string[],
  maxSlots = 9,
): IconSlot[] {
  const slots = slotsFromLevel(level, maxSlots)
  const filled = existingImages.filter(Boolean).length
  if (filled >= slots.length) return []
  return slots.slice(filled)
}

export function iconPackStats(): { count: number; prefix: string } {
  return { count: Object.keys(data.icons).length, prefix: data.prefix }
}
