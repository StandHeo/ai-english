import type { DatabaseSync } from 'node:sqlite'
import { randomId, randomToken, sha256Hex } from './cryptoUtil.js'
import type { EntitlementRow, OrderRow, SessionRow, UserRow } from './db.js'

const DAY_MS = 24 * 60 * 60 * 1000

export function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS || 14)
  const n = Number.isFinite(days) && days > 0 ? days : 14
  return n * DAY_MS
}

export function findUserByPhone(db: DatabaseSync, phone: string): UserRow | undefined {
  return db.prepare('SELECT id, phone, created_at FROM users WHERE phone = ?').get(phone) as
    | UserRow
    | undefined
}

export function findUserById(db: DatabaseSync, id: string): UserRow | undefined {
  return db.prepare('SELECT id, phone, created_at FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined
}

export function getOrCreateUser(db: DatabaseSync, phone: string): UserRow {
  const existing = findUserByPhone(db, phone)
  if (existing) return existing
  const row: UserRow = {
    id: randomId(),
    phone,
    created_at: new Date().toISOString(),
  }
  db.prepare('INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)').run(
    row.id,
    row.phone,
    row.created_at,
  )
  return row
}

export function getEntitlement(db: DatabaseSync, userId: string): EntitlementRow | undefined {
  return db
    .prepare('SELECT user_id, expires_at, source, updated_at FROM entitlements WHERE user_id = ?')
    .get(userId) as EntitlementRow | undefined
}

export function plusFromExpiresAt(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t > now
}

export function mePayload(expiresAt: string | null | undefined, now = Date.now()) {
  const plus = plusFromExpiresAt(expiresAt, now)
  return { plus, expiresAt: expiresAt ?? null }
}

export function addPlusDays(
  db: DatabaseSync,
  userId: string,
  days: number,
  source: 'manual' | 'wechat',
  now = Date.now(),
): string {
  const current = getEntitlement(db, userId)
  const currentMs = current?.expires_at ? Date.parse(current.expires_at) : NaN
  const base = Math.max(now, Number.isFinite(currentMs) ? currentMs : 0)
  const expiresAt = new Date(base + days * DAY_MS).toISOString()
  const updatedAt = new Date(now).toISOString()
  db.prepare(
    `INSERT INTO entitlements (user_id, expires_at, source, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       expires_at = excluded.expires_at,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  ).run(userId, expiresAt, source, updatedAt)
  return expiresAt
}

export function createSession(db: DatabaseSync, userId: string): string {
  const token = randomToken()
  const now = new Date()
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(
    sha256Hex(token),
    userId,
    new Date(now.getTime() + sessionTtlMs()).toISOString(),
    now.toISOString(),
  )
  return token
}

export function findSession(db: DatabaseSync, token: string): SessionRow | undefined {
  const row = db
    .prepare('SELECT token_hash, user_id, expires_at, created_at FROM sessions WHERE token_hash = ?')
    .get(sha256Hex(token)) as SessionRow | undefined
  if (!row) return undefined
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash)
    return undefined
  }
  return row
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(token))
}

export function deleteUserAccount(db: DatabaseSync, userId: string): void {
  const user = findUserById(db, userId)
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM entitlements WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId)
    if (user) db.prepare('DELETE FROM sms_codes WHERE phone = ?').run(user.phone)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const PLAN_DAYS = { month: 30, year: 365 } as const
export const PLAN_AMOUNT_FEN = { month: 1800, year: 14800 } as const
export type PlanId = keyof typeof PLAN_DAYS

export function isPlanId(value: unknown): value is PlanId {
  return value === 'month' || value === 'year'
}

export function insertOrder(
  db: DatabaseSync,
  input: {
    userId: string
    provider: 'manual' | 'wechat'
    plan: PlanId
    status: 'pending' | 'paid'
    outTradeNo?: string
    paidAt?: string | null
  },
): OrderRow {
  const now = new Date().toISOString()
  const row: OrderRow = {
    id: randomId(),
    user_id: input.userId,
    provider: input.provider,
    plan: input.plan,
    amount_fen: PLAN_AMOUNT_FEN[input.plan],
    status: input.status,
    out_trade_no: input.outTradeNo || `${input.provider}_${randomId()}`,
    created_at: now,
    paid_at: input.status === 'paid' ? input.paidAt ?? now : input.paidAt ?? null,
  }
  db.prepare(
    `INSERT INTO orders (id, user_id, provider, plan, amount_fen, status, out_trade_no, created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.user_id,
    row.provider,
    row.plan,
    row.amount_fen,
    row.status,
    row.out_trade_no,
    row.created_at,
    row.paid_at,
  )
  return row
}

export function findOrderByOutTradeNo(db: DatabaseSync, outTradeNo: string): OrderRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, provider, plan, amount_fen, status, out_trade_no, created_at, paid_at
       FROM orders WHERE out_trade_no = ?`,
    )
    .get(outTradeNo) as OrderRow | undefined
}

export function markOrderPaid(db: DatabaseSync, orderId: string, paidAt = new Date().toISOString()): void {
  db.prepare(`UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?`).run(paidAt, orderId)
}

export function grantPlus(
  db: DatabaseSync,
  phone: string,
  plan: PlanId,
  provider: 'manual' | 'wechat',
): { user: UserRow; expiresAt: string; order: OrderRow } {
  const user = getOrCreateUser(db, phone)
  db.exec('BEGIN')
  try {
    const expiresAt = addPlusDays(db, user.id, PLAN_DAYS[plan], provider)
    const order = insertOrder(db, {
      userId: user.id,
      provider,
      plan,
      status: 'paid',
    })
    db.exec('COMMIT')
    return { user, expiresAt, order }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function applyPaidOrder(db: DatabaseSync, order: OrderRow): { expiresAt: string; alreadyPaid: boolean } {
  if (order.status === 'paid') {
    const ent = getEntitlement(db, order.user_id)
    return { expiresAt: ent?.expires_at || '', alreadyPaid: true }
  }
  if (!isPlanId(order.plan)) {
    throw new Error('invalid_plan')
  }
  db.exec('BEGIN')
  try {
    const fresh = findOrderByOutTradeNo(db, order.out_trade_no)
    if (!fresh) throw new Error('order_not_found')
    if (fresh.status === 'paid') {
      db.exec('COMMIT')
      const ent = getEntitlement(db, fresh.user_id)
      return { expiresAt: ent?.expires_at || '', alreadyPaid: true }
    }
    const source = fresh.provider === 'wechat' ? 'wechat' : 'manual'
    const expiresAt = addPlusDays(db, fresh.user_id, PLAN_DAYS[fresh.plan as PlanId], source)
    markOrderPaid(db, fresh.id)
    db.exec('COMMIT')
    return { expiresAt, alreadyPaid: false }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
