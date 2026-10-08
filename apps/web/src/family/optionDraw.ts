/** picture option / 主词画法描述：可选，过长截断。 */
export const OPTION_DRAW_MAX_CHARS = 160

export function normalizeOptionDraw(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return undefined
  return t.length > OPTION_DRAW_MAX_CHARS ? t.slice(0, OPTION_DRAW_MAX_CHARS) : t
}
