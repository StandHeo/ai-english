/** 与 apps/api 的 match 逻辑保持一致，供 App 离线匹配。 */
export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchExpect(transcript: string, expect: string[]): boolean {
  const t = normalizeSpeech(transcript)
  if (!t || expect.length === 0) return false
  return expect.some((phrase) => {
    const e = normalizeSpeech(phrase)
    if (!e) return false
    if (t === e) return true
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(e)}(?:$|\\s)`)
    return re.test(t)
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
