import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { listTableColumns } from './db.js'
import { maskEmail } from './email.js'
import { plusFromExpiresAt } from './membership.js'
import { maskPhone } from './phone.js'

export const ADMIN_TABLES = ['users', 'entitlements', 'orders', 'sessions', 'auth_codes'] as const
export type AdminTable = (typeof ADMIN_TABLES)[number]

export const ADMIN_LIMIT_DEFAULT = 50
export const ADMIN_LIMIT_MAX = 100

export type Paged<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export function adminUiDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../public/admin')
}

export function adminUiIndex(): string {
  return join(adminUiDir(), 'index.html')
}

export function isAdminTable(name: string): name is AdminTable {
  return (ADMIN_TABLES as readonly string[]).includes(name)
}

export function parseLimitOffset(query: { limit?: unknown; offset?: unknown }): {
  limit: number
  offset: number
} {
  const limitRaw = Number(Array.isArray(query.limit) ? query.limit[0] : query.limit)
  const offsetRaw = Number(Array.isArray(query.offset) ? query.offset[0] : query.offset)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(ADMIN_LIMIT_MAX, Math.max(1, Math.floor(limitRaw)))
    : ADMIN_LIMIT_DEFAULT
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0
  return { limit, offset }
}

function count(db: DatabaseSync, sql: string, param?: string): number {
  const row = (param === undefined ? db.prepare(sql).get() : db.prepare(sql).get(param)) as
    | { n: number }
    | undefined
  return Number(row?.n || 0)
}

export function adminStats(db: DatabaseSync, now = new Date().toISOString()) {
  return {
    users: count(db, 'SELECT COUNT(*) AS n FROM users'),
    activeSessions: count(db, 'SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', now),
    plusActive: count(db, 'SELECT COUNT(*) AS n FROM entitlements WHERE expires_at > ?', now),
    ordersPaid: count(db, `SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`),
    generatedAt: now,
  }
}

function withIdentity<T extends { phone?: string | null; email?: string | null }>(row: T) {
  const phone = row.phone || ''
  const email = row.email || ''
  return {
    ...row,
    phone,
    phoneMasked: phone ? maskPhone(phone) : '',
    email,
    emailMasked: email ? maskEmail(email) : '',
  }
}

export function listAdminUsers(db: DatabaseSync, limit: number, offset: number) {
  const total = count(db, 'SELECT COUNT(*) AS n FROM users')
  const rows = db
    .prepare('SELECT id, email, phone, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as { id: string; email: string | null; phone: string | null; created_at: string }[]
  return {
    items: rows.map((row) => withIdentity(row)),
    total,
    limit,
    offset,
  }
}

export function listAdminSessions(db: DatabaseSync, limit: number, offset: number, now = Date.now()) {
  const total = count(db, 'SELECT COUNT(*) AS n FROM sessions')
  const rows = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.expires_at, s.created_at, u.phone, u.email
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as {
    token_hash: string
    user_id: string
    expires_at: string
    created_at: string
    phone: string | null
    email: string | null
  }[]
  return {
    items: rows.map((row) => {
      const { token_hash, ...rest } = row
      return {
        ...withIdentity(rest),
        expired: Date.parse(row.expires_at) <= now,
        tokenHashPrefix: token_hash.slice(0, 8),
      }
    }),
    total,
    limit,
    offset,
  }
}

export function listAdminEntitlements(db: DatabaseSync, limit: number, offset: number, now = Date.now()) {
  const total = count(db, 'SELECT COUNT(*) AS n FROM entitlements')
  const rows = db
    .prepare(
      `SELECT e.user_id, e.expires_at, e.source, e.updated_at, u.phone, u.email
       FROM entitlements e
       LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as {
    user_id: string
    expires_at: string | null
    source: string
    updated_at: string
    phone: string | null
    email: string | null
  }[]
  return {
    items: rows.map((row) => ({
      ...withIdentity(row),
      plusActive: plusFromExpiresAt(row.expires_at, now),
    })),
    total,
    limit,
    offset,
  }
}

export function listAdminOrders(db: DatabaseSync, limit: number, offset: number) {
  const total = count(db, 'SELECT COUNT(*) AS n FROM orders')
  const rows = db
    .prepare(
      `SELECT o.id, o.user_id, o.provider, o.plan, o.amount_fen, o.status, o.out_trade_no, o.created_at, o.paid_at, u.phone, u.email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as {
    id: string
    user_id: string
    provider: string
    plan: string
    amount_fen: number
    status: string
    out_trade_no: string
    created_at: string
    paid_at: string | null
    phone: string | null
    email: string | null
  }[]
  return {
    items: rows.map((row) => withIdentity(row)),
    total,
    limit,
    offset,
  }
}

function maskAuthRow(row: Record<string, unknown>): Record<string, unknown> {
  const hash = String(row.code_hash || '')
  const dest = String(row.destination || '')
  const masked = dest.includes('@') ? maskEmail(dest) : dest ? maskPhone(dest) : dest
  return {
    ...row,
    destination: masked,
    code_hash: hash ? `${hash.slice(0, 8)}…` : hash,
  }
}

export function browseAdminTable(db: DatabaseSync, name: string, limit: number, offset: number) {
  if (!isAdminTable(name)) return null
  const total = count(db, `SELECT COUNT(*) AS n FROM ${name}`)
  const columns = listTableColumns(db, name)
  const rows = db.prepare(`SELECT * FROM ${name} LIMIT ? OFFSET ?`).all(limit, offset) as Record<
    string,
    unknown
  >[]
  const items = name === 'auth_codes' ? rows.map(maskAuthRow) : rows
  return { name, columns, items, total, limit, offset }
}
