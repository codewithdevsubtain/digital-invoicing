import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getDb, logActivity } from '../database/db.js'

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

interface SafeUser {
  id: number
  username: string
  full_name: string
  role: string
  force_password_change: number
  is_active: number
  created_at: string
}

export const sessions = new Map<string, { userId: number; expiresAt: number }>()
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days for "remember me"
const SHORT_SESSION_TTL_MS = 1000 * 60 * 60 * 4 // 4 hours otherwise

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    force_password_change: user.force_password_change,
    is_active: user.is_active,
    created_at: user.created_at,
  }
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function cleanExpiredSessions() {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(token)
    }
  }
}

export function validateSessionToken(token: string | null | undefined): number {
  if (!token) throw new Error('Not authenticated')
  cleanExpiredSessions()
  const session = sessions.get(token)
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token)
    throw new Error('Session expired')
  }
  const row = getDb().prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(session.userId) as { id: number } | undefined
  if (!row) {
    sessions.delete(token)
    throw new Error('Invalid user')
  }
  return session.userId
}

export function registerAuthHandlers() {
  ipcMain.handle('auth:login', async (_event, username: string, password: string, rememberMe: boolean) => {
    const row = getDb()
      .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
      .get(username) as User | undefined

    if (!row) {
      throw new Error('Invalid username or password')
    }

    const match = bcrypt.compareSync(password, row.password_hash)
    if (!match) {
      throw new Error('Invalid username or password')
    }

    cleanExpiredSessions()
    const token = generateToken()
    const ttl = rememberMe ? SESSION_TTL_MS : SHORT_SESSION_TTL_MS
    sessions.set(token, { userId: row.id, expiresAt: Date.now() + ttl })

    logActivity(row.id, 'login', 'auth', row.id, `User ${row.username} logged in`)

    return {
      user: toSafeUser(row),
      token,
      forcePasswordChange: row.force_password_change === 1,
    }
  })

  ipcMain.handle('auth:getCurrentUser', async (_event, token: string) => {
    cleanExpiredSessions()
    const session = sessions.get(token)
    if (!session) return null

    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as User | undefined
    if (!row || row.is_active === 0) {
      sessions.delete(token)
      return null
    }
    return toSafeUser(row)
  })

  ipcMain.handle('auth:logout', async (_event, token: string) => {
    const session = sessions.get(token)
    sessions.delete(token)
    if (session) {
      logActivity(session.userId, 'logout', 'auth', session.userId)
    }
    return true
  })

  ipcMain.handle(
    'auth:changePassword',
    async (_event, token: string, userId: number, oldPassword: string, newPassword: string) => {
      if (validateSessionToken(token) !== userId) throw new Error('Unauthorized')
      const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined
      if (!row) throw new Error('User not found')

      const match = bcrypt.compareSync(oldPassword, row.password_hash)
      if (!match) throw new Error('Current password is incorrect')

      const newHash = bcrypt.hashSync(newPassword, 10)
      getDb()
        .prepare(
          'UPDATE users SET password_hash = ?, force_password_change = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(newHash, userId)

      logActivity(userId, 'change_password', 'auth', userId)
      return true
    }
  )
}
