import { getDb } from './db.js'

export function runMigrations(): void {
  const db = getDb()

  // migrations table tracks applied schema migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>).map((r) => r.name)
  )

  const migrations: Array<{ name: string; sql: string }> = []

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue
    db.exec(migration.sql)
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name)
    console.log('Applied migration:', migration.name)
  }
}
