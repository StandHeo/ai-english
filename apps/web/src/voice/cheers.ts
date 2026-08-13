/** 选对时口语鼓励：短、多样，适合孩子听。 */

export const SUCCESS_CHEERS = [
  'Yay',
  'Wow',
  'Great',
  'Amazing',
  'Awesome',
  'Super',
  'Fantastic',
  'Brilliant',
  'Nice',
  'Cool',
  'Wonderful',
  'Excellent',
] as const

const BEEP_SUCCESS_LINES = [
  'Beep! Yes!',
  'Amazing!',
  'Awesome!',
  'Great!',
  'Fantastic!',
  'Super!',
  'Wow! Yes!',
  'Brilliant!',
] as const

let cheerCursor = Math.floor(Math.random() * SUCCESS_CHEERS.length)

function nextCheer(): string {
  cheerCursor = (cheerCursor + 1 + Math.floor(Math.random() * 2)) % SUCCESS_CHEERS.length
  return SUCCESS_CHEERS[cheerCursor] || 'Great'
}

function capitalizeWord(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

/** 从 success_say 里尽量抠出主词（如 `Yes! Pool!` → Pool） */
function wordFromSuccessSay(say?: string): string | null {
  if (!say) return null
  const parts = say
    .replace(/[!?.]+/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const skip = new Set(
    ['yes', 'yay', 'wow', 'great', 'nice', 'cool', 'super', 'beep', 'bye', 'bye-bye', 'good', 'job'].map(
      (s) => s.toLowerCase(),
    ),
  )
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!
    if (skip.has(p.toLowerCase())) continue
    if (/^[a-zA-Z][a-zA-Z'-]*$/.test(p)) return capitalizeWord(p)
  }
  return null
}

/**
 * 主线选对时的 TTS 句：`{Cheer}!` 或 `{Cheer}! {Word}!`
 * 鼓励词轮换；主词优先 expect，其次从 success_say 抽取。
 */
export function pickSuccessSpeakLine(opts: {
  successSay?: string
  expect?: string[]
}): string {
  const cheer = nextCheer()
  const fromExpect = opts.expect?.[0]?.trim()
  const word = fromExpect
    ? capitalizeWord(fromExpect)
    : wordFromSuccessSay(opts.successSay)
  if (!word) return `${cheer}!`
  return `${cheer}! ${word}!`
}

/** Beep 选对短句，轮换多样鼓励 */
export function pickBeepSuccessLine(successSay?: string): string {
  // 明确告别等脚本句保留
  if (successSay && /bye/i.test(successSay)) return successSay
  if (successSay && /party/i.test(successSay) && !/yes/i.test(successSay)) return successSay
  const i = Math.floor(Math.random() * BEEP_SUCCESS_LINES.length)
  return BEEP_SUCCESS_LINES[i] || 'Amazing!'
}

/** 通关仪式用 cheer 词（无感叹号） */
export function pickCeremonyCheer(cheerIndex: number): string {
  return SUCCESS_CHEERS[Math.abs(cheerIndex) % SUCCESS_CHEERS.length] || 'Great'
}
