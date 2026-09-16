/** Normalize an email to lowercase, or null if invalid. */
export function normalizeEmail(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s || s.length > 254 || s.includes('..')) return null
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) return null
  return s
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const keep = local.slice(0, 1)
  return `${keep}***@${domain}`
}
