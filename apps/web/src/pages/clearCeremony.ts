import type { LevelScript } from '../types'
import { pickCeremonyCheer } from '../voice/cheers'

const STAR_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffe08a"/>
          <stop offset="100%" stop-color="#f0b429"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="#fff8e8"/>
      <path fill="url(#g)" d="M60 18l12.4 25.1 27.7 4-20 19.5 4.7 27.6L60 80.8 35.2 94.2l4.7-27.6-20-19.5 27.7-4z"/>
    </svg>`,
  )

export function primaryWord(level: LevelScript): string | null {
  const raw = level.target_words?.[0]
  if (!raw || typeof raw !== 'string') return null
  const w = raw.trim().toLowerCase()
  return w || null
}

export function clearCeremonyTtsLine(level: LevelScript, cheerIndex: number): string {
  const cheer = pickCeremonyCheer(cheerIndex)
  const word = primaryWord(level)
  if (!word) return `${cheer}!`
  const pretty = word
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
  return `${cheer}! ${pretty}!`
}

/** Resolve display path for ceremony sticker (content-relative or data URL). */
export function resolveCeremonyStickerSrc(level: LevelScript): string {
  if (level.reward?.stickerImage) return level.reward.stickerImage
  const word = primaryWord(level)
  if (word) {
    const slug = word.replace(/\s+/g, '-')
    return `assets/items/${slug}.png`
  }
  const fromBeat = level.beats?.find((b) => b.show)?.show
  if (fromBeat) return fromBeat
  return STAR_PLACEHOLDER
}

export function isDataUrl(src: string): boolean {
  return src.startsWith('data:')
}

export { STAR_PLACEHOLDER }
