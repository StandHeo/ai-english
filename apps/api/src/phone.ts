/** Normalize a China mainland mobile number to 11 digits, or null if invalid. */
export function normalizePhone(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/[\s-]/g, '')
  const digits = s.replace(/^\+?86/, '')
  if (!/^1[3-9]\d{9}$/.test(digits)) return null
  return digits
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}
