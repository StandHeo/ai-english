/** 配图槽位 / 选项匹配用的规范化键：小写、剥冠词、取首个英文词；无拉丁词则整串。 */
export function normalizeSlotSubjectKey(subject: string): string {
  const trimmed = subject
    .trim()
    .toLowerCase()
    .replace(/[_.,/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^(an|the|a)\s+/u, '')
  const latin = stripped.match(/[a-z]+/)
  if (latin) return latin[0]
  return stripped
}

export function slotSubjectKey(subject: string): string {
  return normalizeSlotSubjectKey(subject)
}
