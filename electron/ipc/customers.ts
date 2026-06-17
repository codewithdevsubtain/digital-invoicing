import { ipcMain } from 'electron'
import { getDb, logActivity } from '../database/db.js'

interface Customer {
  id: number
  customer_code: string | null
  name: string
  company_name: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  ntn: string | null
  strn: string | null
  opening_balance: number
  opening_balance_type: 'debit' | 'credit'
  is_active: number
  created_at: string
}

interface CustomerLedger {
  id: number
  customer_id: number
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

function assertUser(userId: number) {
  const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: number } | undefined
  if (!user) throw new Error('Invalid user')
}

function generateCustomerCode(): string {
  const row = getDb()
    .prepare("SELECT customer_code FROM customers WHERE customer_code LIKE 'C-%' ORDER BY customer_code DESC LIMIT 1")
    .get() as { customer_code: string } | undefined

  let next = 1
  if (row?.customer_code) {
    const match = row.customer_code.match(/C-(\d+)/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `C-${String(next).padStart(4, '0')}`
}

function recordOpeningBalance(customerId: number, amount: number, type: 'debit' | 'credit', date: string) {
  getDb().prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND transaction_type = 'opening_balance'").run(customerId)

  if (amount === 0) return

  const debit = type === 'debit' ? amount : 0
  const credit = type === 'credit' ? amount : 0
  getDb()
    .prepare(
      'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(customerId, date, 'opening_balance', null, null, debit, credit, debit - credit, 'Opening balance')
}

export function registerCustomerHandlers() {
  ipcMain.handle(
    'customers:list',
    async (
      _event,
      userId: number,
      filters: { search?: string; isActive?: boolean | null } = {}
    ) => {
      assertUser(userId)
      const where: string[] = []
      const values: unknown[] = []

      if (filters.isActive !== null && filters.isActive !== undefined) {
        where.push('c.is_active = ?')
        values.push(filters.isActive ? 1 : 0)
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        where.push('(c.name LIKE ? OR c.company_name LIKE ? OR c.customer_code LIKE ? OR c.phone LIKE ?)')
        values.push(term, term, term, term)
      }

      const sql = `
        SELECT c.*,
          COALESCE((SELECT SUM(debit - credit) FROM customer_ledger WHERE customer_id = c.id), 0) AS current_balance,
          (SELECT COUNT(*) FROM projects WHERE customer_id = c.id AND status NOT IN ('completed', 'cancelled')) AS active_projects_count
        FROM customers c
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.created_at DESC
      `
      return getDb().prepare(sql).all(...values) as (Customer & { current_balance: number; active_projects_count: number })[]
    }
  )

  ipcMain.handle('customers:get', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const row = getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | undefined
    if (!row) return null
    const balance = getDb()
      .prepare('SELECT COALESCE(SUM(debit - credit), 0) AS b FROM customer_ledger WHERE customer_id = ?')
      .get(id) as { b: number }
    return { ...row, current_balance: balance.b }
  })

  ipcMain.handle(
    'customers:create',
    async (
      _event,
      userId: number,
      data: {
        name: string
        company_name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        strn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => {
      assertUser(userId)
      const code = generateCustomerCode()
      const openingBalance = Number(data.opening_balance ?? 0)
      const openingType = data.opening_balance_type ?? 'debit'

      const result = getDb()
        .prepare(
          'INSERT INTO customers (customer_code, name, company_name, contact_person, phone, email, address, ntn, strn, opening_balance, opening_balance_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          code,
          data.name,
          data.company_name ?? null,
          data.contact_person ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.address ?? null,
          data.ntn ?? null,
          data.strn ?? null,
          openingBalance,
          openingType,
          data.is_active ?? 1
        )

      const customerId = Number(result.lastInsertRowid)
      const today = new Date().toISOString().split('T')[0]
      recordOpeningBalance(customerId, openingBalance, openingType, today)

      logActivity(userId, 'create', 'customers', customerId, `Created customer ${code} - ${data.name}`)
      return { id: customerId }
    }
  )

  ipcMain.handle(
    'customers:update',
    async (
      _event,
      userId: number,
      id: number,
      data: {
        name?: string
        company_name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        strn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => {
      assertUser(userId)
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
        getDb().prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      }

      if (data.opening_balance !== undefined || data.opening_balance_type !== undefined) {
        const customer = getDb()
          .prepare('SELECT opening_balance, opening_balance_type FROM customers WHERE id = ?')
          .get(id) as
          | { opening_balance: number; opening_balance_type: 'debit' | 'credit' }
          | undefined
        if (!customer) throw new Error('Customer not found')

        const newAmount = data.opening_balance ?? customer.opening_balance
        const newType = data.opening_balance_type ?? customer.opening_balance_type
        const today = new Date().toISOString().split('T')[0]

        getDb()
          .prepare('UPDATE customers SET opening_balance = ?, opening_balance_type = ? WHERE id = ?')
          .run(newAmount, newType, id)
        recordOpeningBalance(id, newAmount, newType, today)
      }

      logActivity(userId, 'update', 'customers', id, `Updated customer ${id}`)
      return true
    }
  )

  ipcMain.handle('customers:toggleActive', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const customer = getDb().prepare('SELECT is_active, name FROM customers WHERE id = ?').get(id) as
      | { is_active: number; name: string }
      | undefined
    if (!customer) throw new Error('Customer not found')

    const newStatus = customer.is_active === 1 ? 0 : 1
    getDb().prepare('UPDATE customers SET is_active = ? WHERE id = ?').run(newStatus, id)
    logActivity(userId, 'toggle_active', 'customers', id, `Set customer ${id} active=${newStatus}`)
    return { is_active: newStatus }
  })

  ipcMain.handle(
    'customers:ledger',
    async (
      _event,
      userId: number,
      id: number,
      filters: { dateFrom?: string; dateTo?: string } = {}
    ) => {
      assertUser(userId)
      const where: string[] = ['cl.customer_id = ?']
      const values: unknown[] = [id]

      if (filters.dateFrom) {
        where.push('cl.date >= ?')
        values.push(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.push('cl.date <= ?')
        values.push(filters.dateTo)
      }

      const sql = `
        SELECT cl.*,
          COALESCE(si.invoice_number, cr.receipt_number) AS reference_no,
          SUM(cl.debit - cl.credit) OVER (ORDER BY cl.date, cl.id) AS running_balance
        FROM customer_ledger cl
        LEFT JOIN sales_invoices si ON cl.reference_type = 'sales_invoice' AND cl.reference_id = si.id
        LEFT JOIN customer_receipts cr ON cl.reference_type = 'customer_receipt' AND cl.reference_id = cr.id
        WHERE ${where.join(' AND ')}
        ORDER BY cl.date, cl.id
      `
      return getDb().prepare(sql).all(...values) as (CustomerLedger & { running_balance: number })[]
    }
  )

  ipcMain.handle('customers:balance', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const row = getDb()
      .prepare('SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM customer_ledger WHERE customer_id = ?')
      .get(id) as { balance: number }
    return row.balance
  })

  ipcMain.handle('customers:summary', async (_event, userId: number) => {
    assertUser(userId)
    const rows = getDb()
      .prepare(
        `
        SELECT c.id,
          COALESCE((SELECT SUM(debit - credit) FROM customer_ledger WHERE customer_id = c.id), 0) AS balance
        FROM customers c
      `
      )
      .all() as { id: number; balance: number }[]

    const totalReceivables = rows.reduce((sum, r) => sum + Math.max(0, r.balance), 0)
    const customersWithBalance = rows.filter((r) => r.balance > 0.001).length

    const overdue = getDb()
      .prepare(
        `
        SELECT COUNT(DISTINCT customer_id) AS count
        FROM sales_invoices
        WHERE payment_status IN ('unpaid', 'partial') AND date < date('now')
      `
      )
      .get() as { count: number }

    return {
      totalReceivables,
      customersWithBalance,
      overdueCount: overdue.count,
    }
  })

  ipcMain.handle('customers:projects', async (_event, userId: number, id: number) => {
    assertUser(userId)
    return getDb()
      .prepare('SELECT * FROM projects WHERE customer_id = ? ORDER BY created_at DESC')
      .all(id) as Customer[]
  })
}
