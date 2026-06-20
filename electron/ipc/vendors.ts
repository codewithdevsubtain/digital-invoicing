import { ipcMain } from 'electron'
import { getDb, logActivity } from '../database/db.js'
import { assertAuth } from './guard.js'

interface Vendor {
  id: number
  vendor_code: string | null
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  ntn: string | null
  opening_balance: number
  opening_balance_type: 'debit' | 'credit'
  is_active: number
  created_at: string
}

interface VendorLedger {
  id: number
  vendor_id: number
  date: string
  transaction_type: string
  reference_id: number | null
  reference_type: string | null
  reference_no?: string | null
  debit: number
  credit: number
  balance_after: number
  description: string | null
  created_at: string
}

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function generateVendorCode(): string {
  const row = getDb()
    .prepare("SELECT vendor_code FROM vendors WHERE vendor_code LIKE 'V-%' ORDER BY vendor_code DESC LIMIT 1")
    .get() as { vendor_code: string } | undefined

  let next = 1
  if (row?.vendor_code) {
    const match = row.vendor_code.match(/V-(\d+)/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `V-${String(next).padStart(4, '0')}`
}

function recordOpeningBalance(vendorId: number, amount: number, type: 'debit' | 'credit', date: string) {
  // Clear any existing opening balance entry
  getDb().prepare("DELETE FROM vendor_ledger WHERE vendor_id = ? AND transaction_type = 'opening_balance'").run(vendorId)

  if (amount === 0) return

  const debit = type === 'debit' ? amount : 0
  const credit = type === 'credit' ? amount : 0
  getDb()
    .prepare(
      'INSERT INTO vendor_ledger (vendor_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(vendorId, date, 'opening_balance', null, null, debit, credit, debit - credit, 'Opening balance')
}

export function registerVendorHandlers() {
  ipcMain.handle(
    'vendors:list',
    async (
      _event,
      token: string,
      userId: number,
      filters: { search?: string; isActive?: boolean | null } = {}
    ) => {
      assertUser(token, userId)
      const where: string[] = []
      const values: unknown[] = []

      if (filters.isActive !== null && filters.isActive !== undefined) {
        where.push('v.is_active = ?')
        values.push(filters.isActive ? 1 : 0)
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        where.push('(v.name LIKE ? OR v.vendor_code LIKE ? OR v.phone LIKE ?)')
        values.push(term, term, term)
      }

      const sql = `
        SELECT v.*,
          COALESCE((SELECT SUM(debit - credit) FROM vendor_ledger WHERE vendor_id = v.id), 0) AS current_balance
        FROM vendors v
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY v.created_at DESC
      `
      return getDb().prepare(sql).all(...values) as (Vendor & { current_balance: number })[]
    }
  )

  ipcMain.handle('vendors:get', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const row = getDb().prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor | undefined
    if (!row) return null
    const balance = getDb()
      .prepare('SELECT COALESCE(SUM(debit - credit), 0) AS b FROM vendor_ledger WHERE vendor_id = ?')
      .get(id) as { b: number }
    return { ...row, current_balance: balance.b }
  })

  ipcMain.handle(
    'vendors:create',
    async (
      _event,
      token: string,
      userId: number,
      data: {
        name: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => {
      assertUser(token, userId)
      const code = generateVendorCode()
      const openingBalance = Number(data.opening_balance ?? 0)
      const openingType = data.opening_balance_type ?? 'credit'

      const result = getDb()
        .prepare(
          'INSERT INTO vendors (vendor_code, name, contact_person, phone, email, address, ntn, opening_balance, opening_balance_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          code,
          data.name,
          data.contact_person ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.address ?? null,
          data.ntn ?? null,
          openingBalance,
          openingType,
          data.is_active ?? 1
        )

      const vendorId = Number(result.lastInsertRowid)
      const today = new Date().toISOString().split('T')[0]
      recordOpeningBalance(vendorId, openingBalance, openingType, today)

      logActivity(userId, 'create', 'vendors', vendorId, `Created vendor ${code} - ${data.name}`)
      return { id: vendorId }
    }
  )

  ipcMain.handle(
    'vendors:update',
    async (
      _event,
      token: string,
      userId: number,
      id: number,
      data: {
        name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => {
      assertUser(token, userId)
      const sets: string[] = []
      const values: unknown[] = []

      for (const [key, value] of Object.entries(data)) {
        if (key === 'opening_balance' || key === 'opening_balance_type') continue
        sets.push(`${key} = ?`)
        values.push(value)
      }
      if (sets.length === 0 && data.opening_balance === undefined) {
        throw new Error('No fields to update')
      }

      if (sets.length) {
        values.push(id)
        getDb().prepare(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      }

      // If opening balance details changed, update ledger opening entry
      if (data.opening_balance !== undefined || data.opening_balance_type !== undefined) {
        const vendor = getDb().prepare('SELECT opening_balance, opening_balance_type FROM vendors WHERE id = ?').get(id) as
          | { opening_balance: number; opening_balance_type: 'debit' | 'credit' }
          | undefined
        if (!vendor) throw new Error('Vendor not found')

        const newAmount = data.opening_balance ?? vendor.opening_balance
        const newType = data.opening_balance_type ?? vendor.opening_balance_type
        const today = new Date().toISOString().split('T')[0]

        getDb()
          .prepare('UPDATE vendors SET opening_balance = ?, opening_balance_type = ? WHERE id = ?')
          .run(newAmount, newType, id)
        recordOpeningBalance(id, newAmount, newType, today)
      }

      logActivity(userId, 'update', 'vendors', id, `Updated vendor ${id}`)
      return true
    }
  )

  ipcMain.handle('vendors:toggleActive', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const vendor = getDb().prepare('SELECT is_active, name FROM vendors WHERE id = ?').get(id) as
      | { is_active: number; name: string }
      | undefined
    if (!vendor) throw new Error('Vendor not found')

    const newStatus = vendor.is_active === 1 ? 0 : 1
    getDb().prepare('UPDATE vendors SET is_active = ? WHERE id = ?').run(newStatus, id)
    logActivity(userId, 'toggle_active', 'vendors', id, `Set vendor ${id} active=${newStatus}`)
    return { is_active: newStatus }
  })

  ipcMain.handle(
    'vendors:ledger',
    async (
      _event,
      token: string,
      userId: number,
      id: number,
      filters: { dateFrom?: string; dateTo?: string } = {}
    ) => {
      assertUser(token, userId)
      const where: string[] = ['vl.vendor_id = ?']
      const values: unknown[] = [id]

      if (filters.dateFrom) {
        where.push('vl.date >= ?')
        values.push(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.push('vl.date <= ?')
        values.push(filters.dateTo)
      }

      const sql = `
        SELECT vl.*,
          COALESCE(pi.invoice_number, vp.payment_number) AS reference_no,
          SUM(vl.debit - vl.credit) OVER (ORDER BY vl.date, vl.id) AS running_balance
        FROM vendor_ledger vl
        LEFT JOIN purchase_invoices pi ON vl.reference_type = 'purchase_invoice' AND vl.reference_id = pi.id
        LEFT JOIN vendor_payments vp ON vl.reference_type = 'vendor_payment' AND vl.reference_id = vp.id
        WHERE ${where.join(' AND ')}
        ORDER BY vl.date, vl.id
      `
      return getDb().prepare(sql).all(...values) as (VendorLedger & { running_balance: number })[]
    }
  )

  ipcMain.handle('vendors:balance', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const row = getDb()
      .prepare('SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM vendor_ledger WHERE vendor_id = ?')
      .get(id) as { balance: number }
    return row.balance
  })

  ipcMain.handle('vendors:summary', async (_event, token: string, userId: number) => {
    assertUser(token, userId)
    const rows = getDb()
      .prepare(
        `
        SELECT v.id,
          COALESCE((SELECT SUM(debit - credit) FROM vendor_ledger WHERE vendor_id = v.id), 0) AS balance
        FROM vendors v
      `
      )
      .all() as { id: number; balance: number }[]

    const totalPayables = rows.reduce((sum, r) => sum + Math.max(0, -r.balance), 0)
    const outstandingCount = rows.filter((r) => Math.abs(r.balance) > 0.001).length
    return { totalPayables, outstandingCount }
  })
}
