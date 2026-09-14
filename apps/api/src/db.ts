import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))

export const MIGRATION_FILES = ['001_init.sql'] as const

export function resolveDatabasePath(override?: string): string {
  if (override) return override
  if (process.env.DATABASE_PATH?.trim()) return process.env.DATABASE_PATH.trim()
  const dataDir = (process.env.DATA_DIR || 'data').trim()
  return join(dataDir, 'membership.db')
}

export function openDatabase(databasePath?: string): DatabaseSync {
  const path = resolveDatabasePath(databasePath)
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(db)
  return db
}

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => String((row as { id: string }).id)),
  )
  for (const file of MIGRATION_FILES) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(here, 'migrations', file), 'utf8')
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
      file,
      new Date().toISOString(),
    )
  }
}

export type UserRow = { id: string; phone: string; created_at: string }
export type EntitlementRow = {
  user_id: string
  expires_at: string | null
  source: string
  updated_at: string
}
export type OrderRow = {
  id: string
  user_id: string
  provider: string
  plan: string
  amount_fen: number
  status: string
  out_trade_no: string
  created_at: string
  paid_at: string | null
}
export type SessionRow = {
  token_hash: string
  user_id: string
  expires_at: string
  created_at: string
}

export function listTableNames(db: DatabaseSync): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

export function listTableColumns(db: DatabaseSync, table: string): string[] {
  if (!/^[a-z0-9_]+$/i.test(table)) return []
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String((row as { name: string }).name))
}
