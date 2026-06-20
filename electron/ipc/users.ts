import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { getDb, logActivity } from '../database/db.js'
import { validateSessionToken } from './auth.js'

interface User {
  id: number
  username: string
  password_hash: string
  full_name: string
  role: string
  force_password_change: number
  is_active: number
  created_at: string
  updated_at: string
}

interface ActivityLog {
  id: number
  user_id: number | null
  action: string
  module: string | null
  record_id: number | null
  details: string | null
  timestamp: string
  username?: string
  full_name?: string
}

function assertAdmin(token: string, userId: number) {
  const sessionUserId = validateSessionToken(token)
  if (sessionUserId !== userId) throw new Error('Unauthorized')
  const user = getDb().prepare('SELECT role FROM users WHERE id = ?').get(userId) as
    | { role: string }
    | undefined
  if (!user || user.role !== 'admin') {
    throw new Error('Admin access required')
  }
}

function toSafeUser(user: User) {
  const { password_hash, ...safe } = user
  return safe
}

export function registerUserHandlers() {
  ipcMain.handle(
    'activityLog:list',
    async (
      _event,
      token: string,
      userId: number,
      filters: { userId?: number; module?: string; from?: string; to?: string; limit?: number } = {}
    ) => {
      assertAdmin(token, userId)
      const where: string[] = []
      const values: unknown[] = []

      if (filters.userId) {
        where.push('al.user_id = ?')
        values.push(filters.userId)
      }
      if (filters.module) {
        where.push('al.module = ?')
        values.push(filters.module)
      }
      if (filters.from) {
        where.push('date(al.timestamp) >= ?')
        values.push(filters.from)
      }
      if (filters.to) {
        where.push('date(al.timestamp) <= ?')
        values.push(filters.to)
      }

      const sql = `
        SELECT al.*, u.username, u.full_name
        FROM activity_log al
        LEFT JOIN users u ON al.user_id = u.id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY al.timestamp DESC
        LIMIT ?
      `
      values.push(filters.limit ?? 500)
      return getDb().prepare(sql).all(...values) as ActivityLog[]
    }
  )

  ipcMain.handle('users:list', async (_event, token: string, userId: number) => {
    assertAdmin(token, userId)
    const rows = getDb()
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all() as User[]
    return rows.map(toSafeUser)
  })

  ipcMain.handle('users:get', async (_event, token: string, userId: number, id: number) => {
    assertAdmin(token, userId)
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
    return row ? toSafeUser(row) : null
  })

  ipcMain.handle(
    'users:create',
    async (_event, token: string, userId: number, data: { username: string; password: string; full_name: string; role: string }) => {
      assertAdmin(token, userId)
      const hash = bcrypt.hashSync(data.password, 10)
      const result = getDb()
        .prepare(
          'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?)'
        )
        .run(data.username, hash, data.full_name, data.role, 1)

      logActivity(userId, 'create', 'users', Number(result.lastInsertRowid), `Created user ${data.username}`)
      return { id: result.lastInsertRowid }
    }
  )

  ipcMain.handle(
    'users:update',
    async (
      _event,
      token: string,
      userId: number,
      id: number,
      data: { full_name?: string; role?: string; is_active?: number }
    ) => {
      assertAdmin(token, userId)
      if (userId === id && data.is_active === 0) {
        throw new Error('You cannot deactivate your own account')
      }

      const sets: string[] = []
      const values: unknown[] = []
      for (const [key, value] of Object.entries(data)) {
        sets.push(`${key} = ?`)
        values.push(value)
      }
      if (sets.length === 0) throw new Error('No fields to update')
      values.push(id)

      getDb()
        .prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...values)

      logActivity(userId, 'update', 'users', id, `Updated user ${id}`)
      return true
    }
  )

  ipcMain.handle('users:deactivate', async (_event, token: string, userId: number, id: number) => {
    assertAdmin(token, userId)
    if (userId === id) {
      throw new Error('You cannot deactivate your own account')
    }
    getDb()
      .prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(id)
    logActivity(userId, 'deactivate', 'users', id, `Deactivated user ${id}`)
    return true
  })

  ipcMain.handle(
    'users:resetPassword',
    async (_event, token: string, userId: number, id: number, newPassword: string) => {
      assertAdmin(token, userId)
      const hash = bcrypt.hashSync(newPassword, 10)
      getDb()
        .prepare(
          'UPDATE users SET password_hash = ?, force_password_change = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(hash, id)
      logActivity(userId, 'reset_password', 'users', id, `Reset password for user ${id}`)
      return true
    }
  )
}
