import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction } from '../database/db.js'
import { assertAuth } from './guard.js'

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateEntryNumber(): string {
  const year = new Date().getFullYear()
  const row = getDb()
    .prepare("SELECT entry_number FROM journal_entries WHERE entry_number LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`JE-${year}-%`) as { entry_number: string } | undefined
  let seq = 1
  if (row) { const p = row.entry_number.split('-'); seq = parseInt(p[p.length - 1], 10) + 1 }
  return `JE-${year}-${String(seq).padStart(4, '0')}`
}

// =====================================================================
// CHART OF ACCOUNTS
// =====================================================================
function registerCOAHandlers() {
  ipcMain.handle('acc:coa:list', async () => {
    const accounts = getDb().prepare('SELECT * FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code').all()
    // Check each account for transactions
    const result = (accounts as Array<{ id: number }>).map((a) => {
      const hasTx = (getDb().prepare(
        'SELECT COUNT(*) as c FROM journal_entry_lines WHERE account_id = ?'
      ).get(a.id) as { c: number }).c > 0
      return { ...a, has_transactions: hasTx }
    })
    return result
  })

  ipcMain.handle('acc:coa:create', async (_event, token: string, userId: number, data: {
    account_code: string; account_name: string; account_type: string; parent_id?: number
  }) => {
    assertUser(token, userId)
    if (!data.account_code || !data.account_name) throw new Error('Code and name are required')
    try {
      const result = getDb().prepare(`
        INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_id) VALUES (?, ?, ?, ?)
      `).run(data.account_code, data.account_name, data.account_type, data.parent_id ?? null)
      logActivity(userId, 'create', 'accounting', Number(result.lastInsertRowid), `Created account ${data.account_code} - ${data.account_name}`)
      return { id: result.lastInsertRowid }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('Account code already exists')
      throw err
    }
  })

  ipcMain.handle('acc:coa:update', async (_event, token: string, userId: number, id: number, data: {
    account_name?: string; account_type?: string; parent_id?: number | null
  }) => {
    assertUser(token, userId)
    const sets: string[] = []; const vals: unknown[] = []
    if (data.account_name !== undefined) { sets.push('account_name = ?'); vals.push(data.account_name) }
    if (data.account_type !== undefined) { sets.push('account_type = ?'); vals.push(data.account_type) }
    if (data.parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(data.parent_id) }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    getDb().prepare(`UPDATE chart_of_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    logActivity(userId, 'update', 'accounting', id, `Updated account #${id}`)
    return true
  })

  ipcMain.handle('acc:coa:toggleActive', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const cur = getDb().prepare('SELECT is_active FROM chart_of_accounts WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!cur) throw new Error('Account not found')
    const hasTx = (getDb().prepare('SELECT COUNT(*) as c FROM journal_entry_lines WHERE account_id = ?').get(id) as { c: number }).c > 0
    if (cur.is_active && hasTx) throw new Error('Cannot deactivate an account with transaction history')
    const ns = cur.is_active ? 0 : 1
    getDb().prepare('UPDATE chart_of_accounts SET is_active = ? WHERE id = ?').run(ns, id)
    logActivity(userId, 'update', 'accounting', id, `${ns ? 'Activated' : 'Deactivated'} account #${id}`)
    return { is_active: ns }
  })
}

// =====================================================================
// JOURNAL ENTRIES
// =====================================================================
function registerJournalHandlers() {
  ipcMain.handle('acc:journal:list', async (_event, token: string, userId: number, filters?: {
    date_from?: string; date_to?: string; account_id?: number; reference_type?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.date_from) { where.push('je.date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('je.date <= ?'); vals.push(filters.date_to) }
    if (filters?.reference_type) { where.push('je.reference_type = ?'); vals.push(filters.reference_type) }
    if (filters?.account_id) {
      where.push('je.id IN (SELECT DISTINCT journal_entry_id FROM journal_entry_lines WHERE account_id = ?)')
      vals.push(filters.account_id)
    }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const entries = getDb().prepare(`
      SELECT je.*, u.full_name as created_by_name
      FROM journal_entries je
      LEFT JOIN users u ON je.created_by = u.id
      ${wc}
      ORDER BY je.date DESC, je.id DESC
    `).all(...vals)

    // Attach lines
    const entryIds = (entries as Array<{ id: number }>).map((e) => e.id)
    if (entryIds.length === 0) return entries
    const placeholders = entryIds.map(() => '?').join(',')
    const lines = getDb().prepare(`
      SELECT jel.*, ca.account_code, ca.account_name, ca.account_type
      FROM journal_entry_lines jel
      JOIN chart_of_accounts ca ON jel.account_id = ca.id
      WHERE jel.journal_entry_id IN (${placeholders})
      ORDER BY jel.id
    `).all(...entryIds) as Array<{ journal_entry_id: number }>

    const linesByEntry = new Map<number, typeof lines>()
    for (const line of lines) {
      if (!linesByEntry.has(line.journal_entry_id)) linesByEntry.set(line.journal_entry_id, [])
      linesByEntry.get(line.journal_entry_id)!.push(line)
    }

    return (entries as Array<{ id: number }>).map((e) => ({
      ...e, lines: linesByEntry.get(e.id) ?? [],
    }))
  })

  ipcMain.handle('acc:journal:create', async (_event, token: string, userId: number, data: {
    date: string; description: string
    lines: Array<{ account_id: number; debit: number; credit: number; description?: string }>
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const totalDebit = round2(data.lines.reduce((s, l) => s + (l.debit || 0), 0))
      const totalCredit = round2(data.lines.reduce((s, l) => s + (l.credit || 0), 0))
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Journal entry does not balance: Debits ${totalDebit} vs Credits ${totalCredit}`)
      }
      if (data.lines.length < 2) throw new Error('Journal entry must have at least 2 lines')
      const entryNumber = generateEntryNumber()
      const result = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, description, created_by) VALUES (?, ?, ?, ?)
      `).run(entryNumber, data.date, data.description, userId)
      const jeId = Number(result.lastInsertRowid)
      const ins = getDb().prepare(`
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)
      `)
      for (const line of data.lines) {
        ins.run(jeId, line.account_id, line.debit || 0, line.credit || 0, line.description ?? null)
      }
      logActivity(userId, 'create', 'accounting', jeId, `Manual journal entry ${entryNumber}`)
      return { id: jeId, entry_number: entryNumber }
    })
  })

  ipcMain.handle('acc:ledger', async (_event, token: string, userId: number, data: {
    account_id: number; date_from?: string; date_to?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = ['jel.account_id = ?']; const vals: unknown[] = [data.account_id]
    if (data.date_from) { where.push('je.date >= ?'); vals.push(data.date_from) }
    if (data.date_to) { where.push('je.date <= ?'); vals.push(data.date_to) }
    const rows = getDb().prepare(`
      SELECT jel.*, je.date, je.entry_number, je.description as je_description, je.reference_type, je.reference_id,
             ca.account_code, ca.account_name
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jel.account_id = ca.id
      WHERE ${where.join(' AND ')}
      ORDER BY je.date ASC, je.id ASC, jel.id ASC
    `).all(...vals) as Array<{ debit: number; credit: number }>

    let runningBalance = 0
    return rows.map((r: any) => {
      runningBalance = round2(runningBalance + (r.debit || 0) - (r.credit || 0))
      return { ...r, running_balance: runningBalance }
    })
  })
}

// =====================================================================
// TRIAL BALANCE
// =====================================================================
function registerTrialBalanceHandler() {
  ipcMain.handle('acc:trialBalance', async (_event, token: string, userId: number, asOfDate: string) => {
    assertUser(token, userId)
    const rows = getDb().prepare(`
      SELECT ca.id, ca.account_code, ca.account_name, ca.account_type,
        COALESCE(SUM(jel.debit), 0) as total_debit,
        COALESCE(SUM(jel.credit), 0) as total_credit
      FROM chart_of_accounts ca
      LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.date <= ?
      WHERE ca.is_active = 1
      GROUP BY ca.id
      ORDER BY ca.account_code
    `).all(asOfDate) as Array<{
      id: number; account_code: string; account_name: string; account_type: string
      total_debit: number; total_credit: number
    }>

    const result = rows.map((r: any) => {
      const balance = round2(r.total_debit - r.total_credit)
      // Assets/Expenses: debit normal; Liabilities/Equity/Income: credit normal
      const isDebitNormal = ['asset', 'expense'].includes(r.account_type)
      return {
        ...r,
        total_debit: round2(r.total_debit),
        total_credit: round2(r.total_credit),
        closing_debit: isDebitNormal && balance > 0 ? balance : (!isDebitNormal && balance < 0 ? -balance : 0),
        closing_credit: !isDebitNormal && balance > 0 ? balance : (isDebitNormal && balance < 0 ? -balance : 0),
      }
    })

    const totalDr = round2(result.reduce((s: number, r: any) => s + r.closing_debit, 0))
    const totalCr = round2(result.reduce((s: number, r: any) => s + r.closing_credit, 0))
    return { rows: result, total_debit: totalDr, total_credit: totalCr }
  })
}

// =====================================================================
// P&L STATEMENT
// =====================================================================
function registerPnLHandler() {
  ipcMain.handle('acc:pnl', async (_event, token: string, userId: number, data: { date_from: string; date_to: string }) => {
    assertUser(token, userId)
    const rows = getDb().prepare(`
      SELECT ca.account_code, ca.account_name, ca.account_type,
        COALESCE(SUM(jel.debit - jel.credit), 0) as balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jel.account_id = ca.id
      WHERE je.date >= ? AND je.date <= ? AND ca.account_type IN ('income', 'expense')
      GROUP BY ca.id
      ORDER BY ca.account_type, ca.account_code
    `).all(data.date_from, data.date_to) as Array<{
      account_code: string; account_name: string; account_type: string; balance: number
    }>

    const income = rows.filter((r) => r.account_type === 'income')
    const expenses = rows.filter((r) => r.account_type === 'expense')
    const totalIncome = round2(income.reduce((s, r) => s + r.balance, 0))
    const totalExpenses = round2(expenses.reduce((s, r) => s + r.balance, 0))
    const netProfit = round2(totalIncome - totalExpenses)

    return {
      income: income.map((r) => ({ ...r, balance: round2(r.balance) })),
      expenses: expenses.map((r) => ({ ...r, balance: round2(r.balance) })),
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_profit: netProfit,
    }
  })
}

// =====================================================================
// BALANCE SHEET
// =====================================================================
function registerBalanceSheetHandler() {
  ipcMain.handle('acc:balanceSheet', async (_event, token: string, userId: number, asOfDate: string) => {
    assertUser(token, userId)
    // Get balances for all asset, liability, equity accounts
    const rows = getDb().prepare(`
      SELECT ca.account_code, ca.account_name, ca.account_type,
        COALESCE(SUM(jel.debit - jel.credit), 0) as balance
      FROM chart_of_accounts ca
      LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.date <= ?
      WHERE ca.is_active = 1 AND ca.account_type IN ('asset', 'liability', 'equity')
      GROUP BY ca.id
      ORDER BY ca.account_type, ca.account_code
    `).all(asOfDate) as Array<{
      account_code: string; account_name: string; account_type: string; balance: number
    }>

    // Get P&L for retained earnings (net profit up to asOfDate)
    const pnl = getDb().prepare(`
      SELECT ca.account_type, COALESCE(SUM(jel.debit - jel.credit), 0) as balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jel.account_id = ca.id
      WHERE je.date <= ? AND ca.account_type IN ('income', 'expense')
      GROUP BY ca.account_type
    `).all(asOfDate) as Array<{ account_type: string; balance: number }>

    const incomeTotal = pnl.find((r) => r.account_type === 'income')?.balance ?? 0
    const expenseTotal = pnl.find((r) => r.account_type === 'expense')?.balance ?? 0
    const netProfit = round2(incomeTotal - expenseTotal)

    // Assets: positive balance = asset, negative = contra
    // Liabilities: positive balance = liability (credit normal)
    // Equity: positive = equity
    const assets = rows.filter((r) => r.account_type === 'asset').map((r) => ({ ...r, balance: round2(r.balance) }))
    const liabilities = rows.filter((r) => r.account_type === 'liability').map((r) => ({ ...r, balance: round2(-r.balance) })) // invert for display
    const equity = rows.filter((r) => r.account_type === 'equity').map((r) => ({ ...r, balance: round2(r.balance) }))

    const totalAssets = round2(assets.reduce((s, r) => s + r.balance, 0))
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.balance, 0))
    const totalEquity = round2(equity.reduce((s, r) => s + r.balance, 0) + netProfit)
    const totalLiabEquity = round2(totalLiabilities + totalEquity)

    return {
      assets, liabilities, equity,
      net_profit: netProfit,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      total_liabilities_equity: totalLiabEquity,
    }
  })
}

export function registerAccountingHandlers() {
  registerCOAHandlers()
  registerJournalHandlers()
  registerTrialBalanceHandler()
  registerPnLHandler()
  registerBalanceSheetHandler()
}
