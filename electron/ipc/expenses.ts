import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction, recordCashBankTransaction } from '../database/db.js'
import { assertAuth } from './guard.js'

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateNumber(): string {
  const year = new Date().getFullYear()
  const row = getDb()
    .prepare("SELECT expense_number FROM company_expenses WHERE expense_number LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`EXP-${year}-%`) as { expense_number: string } | undefined
  let seq = 1
  if (row) {
    const parts = row.expense_number.split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `EXP-${year}-${String(seq).padStart(4, '0')}`
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

// Map expense category type to default COA account
function getAccountForCategory(categoryType: string): number {
  switch (categoryType) {
    case 'project': return getCoaId('5300')  // Project Expenses
    case 'overhead': return getCoaId('5600') // Utilities/Overhead
    default: return getCoaId('5500')          // Office Expenses
  }
}

// =====================================================================
// EXPENSE CATEGORIES
// =====================================================================
function registerCategoryHandlers() {
  ipcMain.handle('expenses:categories:list', async () => {
    return getDb().prepare(`
      SELECT ec.*, ca.account_code, ca.account_name
      FROM expense_categories ec
      LEFT JOIN chart_of_accounts ca ON ec.account_id = ca.id
      ORDER BY ec.name
    `).all()
  })

  ipcMain.handle('expenses:categories:create', async (_event, token: string, userId: number, data: { name: string; type: string; account_id?: number }) => {
    assertUser(token, userId)
    if (!data.name) throw new Error('Category name is required')
    try {
      const result = getDb().prepare(
        'INSERT INTO expense_categories (name, type, account_id) VALUES (?, ?, ?)'
      ).run(data.name, data.type, data.account_id ?? null)
      logActivity(userId, 'create', 'expenses', Number(result.lastInsertRowid), `Created expense category ${data.name}`)
      return { id: result.lastInsertRowid }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('Category already exists')
      throw err
    }
  })

  ipcMain.handle('expenses:categories:update', async (_event, token: string, userId: number, id: number, data: { name?: string; type?: string; account_id?: number | null }) => {
    assertUser(token, userId)
    const sets: string[] = []; const vals: unknown[] = []
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name) }
    if (data.type !== undefined) { sets.push('type = ?'); vals.push(data.type) }
    if (data.account_id !== undefined) { sets.push('account_id = ?'); vals.push(data.account_id) }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    try {
      getDb().prepare(`UPDATE expense_categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
      logActivity(userId, 'update', 'expenses', id, `Updated expense category #${id}`)
      return true
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('Category already exists')
      throw err
    }
  })
}

// =====================================================================
// COMPANY EXPENSES
// =====================================================================
function registerCompanyExpenseHandlers() {
  ipcMain.handle('expenses:create', async (_event, token: string, userId: number, data: {
    category_id: number; description?: string; amount: number; date: string
    paid_via: string; bank_account_id?: number
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      if (data.amount <= 0) throw new Error('Amount must be greater than zero')
      const expNumber = generateNumber()

      const result = getDb().prepare(`
        INSERT INTO company_expenses (expense_number, category_id, description, amount, date, paid_via, bank_account_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(expNumber, data.category_id, data.description ?? null, data.amount, data.date, data.paid_via, data.bank_account_id ?? null, userId)
      const expId = Number(result.lastInsertRowid)

      // Cash/bank transaction
      if (data.paid_via === 'cash') {
        const cashAcc = getDb().prepare('SELECT id FROM cash_accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        if (cashAcc) {
          getDb().prepare(`
            INSERT INTO cash_bank_transactions (account_type, account_id, date, transaction_type, amount, reference_type, reference_id, description, balance_after, created_by)
            VALUES ('cash', ?, ?, 'payment', ?, 'company_expense', ?, ?, ?, ?)
          `).run(cashAcc.id, data.date, -data.amount, expId, data.description ?? 'Expense', -data.amount, userId)
          getDb().prepare('UPDATE cash_accounts SET current_balance = current_balance - ? WHERE id = ?').run(data.amount, cashAcc.id)
        }
      } else if (data.paid_via === 'bank' && data.bank_account_id) {
        getDb().prepare(`
          INSERT INTO cash_bank_transactions (account_type, account_id, date, transaction_type, amount, reference_type, reference_id, description, balance_after, created_by)
          VALUES ('bank', ?, ?, 'payment', ?, 'company_expense', ?, ?, ?, ?)
        `).run(data.bank_account_id, data.date, -data.amount, expId, data.description ?? 'Expense', -data.amount, userId)
        getDb().prepare('UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?').run(data.amount, data.bank_account_id)
      }

      // Journal entry
      const cat = getDb().prepare('SELECT type, account_id FROM expense_categories WHERE id = ?').get(data.category_id) as {
        type: string; account_id: number | null
      } | undefined
      const debitAccountId = cat?.account_id ?? getAccountForCategory(cat?.type ?? 'admin')

      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'company_expense', ?, ?, ?)
      `).run(`JE-EXP-${expId}`, data.date, expId, data.description ?? 'Expense', userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      jeLine.run(jeId, debitAccountId, data.amount, 0, data.description ?? 'Expense')
      if (data.paid_via === 'cash') {
        jeLine.run(jeId, getCoaId('1000'), 0, data.amount, 'Cash')
      } else {
        jeLine.run(jeId, getCoaId('1100'), 0, data.amount, 'Bank')
      }

      logActivity(userId, 'create', 'expenses', expId, `Created expense ${expNumber}: ${data.amount}`)
      return { id: expId, expense_number: expNumber }
    })
  })

  ipcMain.handle('expenses:list', async (_event, token: string, userId: number, filters?: {
    category_id?: number; date_from?: string; date_to?: string; paid_via?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = []
    const vals: unknown[] = []
    if (filters?.category_id) { where.push('ce.category_id = ?'); vals.push(filters.category_id) }
    if (filters?.date_from) { where.push('ce.date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('ce.date <= ?'); vals.push(filters.date_to) }
    if (filters?.paid_via) { where.push('ce.paid_via = ?'); vals.push(filters.paid_via) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT ce.*, ec.name as category_name, ec.type as category_type
      FROM company_expenses ce
      JOIN expense_categories ec ON ce.category_id = ec.id
      ${wc}
      ORDER BY ce.date DESC, ce.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('expenses:get', async (_event, token: string, _userId: number, id: number) => {
    return getDb().prepare(`
      SELECT ce.*, ec.name as category_name, ec.type as category_type
      FROM company_expenses ce
      JOIN expense_categories ec ON ce.category_id = ec.id
      WHERE ce.id = ?
    `).get(id) ?? null
  })

  ipcMain.handle('expenses:update', async (_event, token: string, userId: number, id: number, data: {
    category_id?: number; description?: string; amount?: number; date?: string; paid_via?: string; bank_account_id?: number | null
  }) => {
    assertUser(token, userId)
    const sets: string[] = []; const vals: unknown[] = []
    if (data.category_id !== undefined) { sets.push('category_id = ?'); vals.push(data.category_id) }
    if (data.description !== undefined) { sets.push('description = ?'); vals.push(data.description) }
    if (data.amount !== undefined) { sets.push('amount = ?'); vals.push(data.amount) }
    if (data.date !== undefined) { sets.push('date = ?'); vals.push(data.date) }
    if (data.paid_via !== undefined) { sets.push('paid_via = ?'); vals.push(data.paid_via) }
    if (data.bank_account_id !== undefined) { sets.push('bank_account_id = ?'); vals.push(data.bank_account_id) }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    getDb().prepare(`UPDATE company_expenses SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    logActivity(userId, 'update', 'expenses', id, `Updated expense #${id}`)
    return true
  })

  ipcMain.handle('expenses:delete', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const exp = getDb().prepare('SELECT * FROM company_expenses WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!exp) throw new Error('Expense not found')

      // Reverse cash/bank transaction
      if (exp.paid_via === 'cash') {
        const cashTxn = getDb().prepare(
          "SELECT id FROM cash_bank_transactions WHERE reference_type = 'company_expense' AND reference_id = ?"
        ).get(id) as { id: number } | undefined
        if (cashTxn) getDb().prepare('DELETE FROM cash_bank_transactions WHERE id = ?').run(cashTxn.id)
      } else if (exp.paid_via === 'bank' && exp.bank_account_id) {
        getDb().prepare('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?').run(exp.amount as number, exp.bank_account_id as number)
        const bankTxn = getDb().prepare(
          "SELECT id FROM cash_bank_transactions WHERE reference_type = 'company_expense' AND reference_id = ?"
        ).get(id) as { id: number } | undefined
        if (bankTxn) getDb().prepare('DELETE FROM cash_bank_transactions WHERE id = ?').run(bankTxn.id)
      }

      // Delete journal entries for this expense
      const je = getDb().prepare(
        "SELECT id FROM journal_entries WHERE reference_type = 'company_expense' AND reference_id = ?"
      ).get(id) as { id: number } | undefined
      if (je) {
        getDb().prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?').run(je.id)
        getDb().prepare('DELETE FROM journal_entries WHERE id = ?').run(je.id)
      }

      getDb().prepare('DELETE FROM company_expenses WHERE id = ?').run(id)
      logActivity(userId, 'delete', 'expenses', id, `Deleted expense #${id}`)
      return true
    })
  })

  ipcMain.handle('expenses:summary', async (_event, token: string, _userId: number, data: { date_from?: string; date_to?: string }) => {
    const where: string[] = []
    const vals: unknown[] = []
    if (data.date_from) { where.push('ce.date >= ?'); vals.push(data.date_from) }
    if (data.date_to) { where.push('ce.date <= ?'); vals.push(data.date_to) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const total = getDb().prepare(`
      SELECT COALESCE(SUM(ce.amount), 0) as total FROM company_expenses ce ${wc}
    `).get(...vals) as { total: number }
    const byCategory = getDb().prepare(`
      SELECT ec.id, ec.name, ec.type, SUM(ce.amount) as total
      FROM company_expenses ce
      JOIN expense_categories ec ON ce.category_id = ec.id
      ${wc}
      GROUP BY ec.id, ec.name, ec.type
      ORDER BY total DESC
    `).all(...vals)
    return { total: round2(total.total), by_category: byCategory }
  })
}

export function registerExpenseHandlers() {
  registerCategoryHandlers()
  registerCompanyExpenseHandlers()
}
