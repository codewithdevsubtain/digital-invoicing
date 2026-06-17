import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'

const SCHEMA_VERSION = '1.0.1'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database has not been initialized. Call initDatabase() first.')
  }
  return db
}

function hasColumn(table: string, column: string): boolean {
  const cols = db!
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

function applyMigrations(_db: Database.Database) {
  if (!hasColumn('users', 'force_password_change')) {
    _db.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasColumn('users', 'updated_at')) {
    _db.exec('ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')
  }
}

function loadSqlFile(filename: string): string {
  const filePath = path.join(__dirname, filename)
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${filePath}`)
  }
  return fs.readFileSync(filePath, 'utf-8')
}

function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function initDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'database', 'hvac-erp.db')
  ensureDbDirectory(dbPath)

  const isFirstRun = !fs.existsSync(dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const schemaSql = loadSqlFile('schema.sql')
  db.exec(schemaSql)

  if (isFirstRun || getSchemaVersion() !== SCHEMA_VERSION) {
    const seedSql = loadSqlFile('seed.sql')
    db.exec(seedSql)
    seedDefaultSettings()
    setSchemaVersion(SCHEMA_VERSION)
    console.log(`Database seeded (schema version ${SCHEMA_VERSION})`)
  }

  applyMigrations(db)

  seedDefaultUser()

  console.log('Database initialized successfully:', dbPath)
  return db
}

function getSchemaVersion(): string {
  try {
    const row = db!
      .prepare("SELECT value FROM settings WHERE key = 'schema_version'")
      .get() as { value: string } | undefined
    return row?.value ?? ''
  } catch {
    return ''
  }
}

function setSchemaVersion(version: string): void {
  db!
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
    )
    .run(version)
}

function seedDefaultSettings(): void {
  const defaults: Record<string, string> = {
    company_name: 'HVAC ERP',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_ntn: '',
    company_strn: '',
    company_logo: '',
    default_gst_percent: '18',
    default_wht_percent: '4.5',
    currency_symbol: 'PKR',
    financial_year_start_month: '7',
    app_theme: 'light',
  }

  const insert = db!.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value)
  }
}

export function seedDefaultUser(): void {
  const count = (db!.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    db!.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, force_password_change, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('admin', hash, 'System Administrator', 'admin', 1, 1)
    console.log('Default admin user created')
  }
}

export function logActivity(
  userId: number | null,
  action: string,
  module: string,
  recordId: number | null,
  details?: string
): void {
  getDb()
    .prepare(
      'INSERT INTO activity_log (user_id, action, module, record_id, details, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    )
    .run(userId, action, module, recordId, details ?? null)
}

// =====================================================================
// Typed query helpers
// =====================================================================

export function getAll<T>(table: string): T[] {
  const statement = getDb().prepare(`SELECT * FROM ${table}`)
  return statement.all() as T[]
}

export function getById<T>(table: string, id: number): T | undefined {
  const statement = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`)
  return statement.get(id) as T | undefined
}

export function insert(table: string, data: Record<string, unknown>): Database.RunResult {
  const columns = Object.keys(data)
  const placeholders = columns.map(() => '?').join(', ')
  const values = columns.map((col) => data[col])
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  return getDb().prepare(sql).run(...values)
}

export function update(table: string, id: number, data: Record<string, unknown>): Database.RunResult {
  const columns = Object.keys(data)
  const setClause = columns.map((col) => `${col} = ?`).join(', ')
  const values = columns.map((col) => data[col])
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`
  return getDb().prepare(sql).run(...values, id)
}

export function remove(table: string, id: number): Database.RunResult {
  const sql = `DELETE FROM ${table} WHERE id = ?`
  return getDb().prepare(sql).run(id)
}

export function runRaw<T>(sql: string, params: unknown[] = []): T {
  const statement = getDb().prepare(sql)
  if (sql.trim().toLowerCase().startsWith('select')) {
    return statement.all(...params) as T
  }
  return statement.run(...params) as unknown as T
}

export function runTransaction<T>(callback: () => T): T {
  const transaction = getDb().transaction(callback)
  return transaction()
}

// =====================================================================
// Settings helpers
// =====================================================================

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
    )
    .run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value ?? ''
  }
  return settings
}

export function setManySettings(settings: Record<string, string>): void {
  const insert = getDb().prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  )
  const transaction = getDb().transaction((records: Record<string, string>) => {
    for (const [key, value] of Object.entries(records)) {
      insert.run(key, value)
    }
  })
  transaction(settings)
}
