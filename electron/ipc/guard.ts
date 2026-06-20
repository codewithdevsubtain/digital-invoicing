import { getDb } from '../database/db.js'
import { validateSessionToken } from './auth.js'

export function assertAuth(token: string | null | undefined, userId?: number): number {
  const sessionUserId = validateSessionToken(token)
  if (userId !== undefined && sessionUserId !== userId) {
    throw new Error('Unauthorized')
  }
  return sessionUserId
}

export function assertAdmin(token: string | null | undefined, userId: number): void {
  assertAuth(token, userId)
  const user = getDb().prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined
  if (!user || user.role !== 'admin') {
    throw new Error('Admin access required')
  }
}
