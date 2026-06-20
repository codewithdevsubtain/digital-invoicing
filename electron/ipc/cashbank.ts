import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction, recordCashBankTransaction } from '../database/db.js'
import { assertAuth } from './guard.js'

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

// =====================================================================
// BANK ACCOUNTS
// =====================================================================
function registerBankAccountHandlers() {
  ipcMain.handle('cashbank:bank:list', async () => {
    return getDb().prepare('SELECT * FROM bank_accounts ORDER BY account_name').all()
  })

  ipcMain.handle('cashbank:bank:create', async (_event, token: string, userId: number, data: {
    account_name: string; bank_name?: string; account_number?: string; branch?: string; opening_balance?: number
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const ob = data.opening_balance ?? 0
      const result = getDb().prepare(`
        INSERT INTO bank_accounts (account_name, bank_name, account_number, branch, opening_balance, current_balance, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(data.account_name, data.bank_name ?? null, data.account_number ?? null, data.branch ?? null, ob, ob)
      const accId = Number(result.lastInsertRowid)
      if (ob > 0) {
        recordCashBankTransaction('bank', accId, new Date().toISOString().split('T')[0], 'receipt', ob, 'opening_balance', accId, `Opening balance ${data.account_name}`, userId)
      }
      logActivity(userId, 'create', 'cashbank', accId, `Created bank account ${data.account_name}`)
      return { id: accId }
    })
  })

  ipcMain.handle('cashbank:bank:update', async (_event, token: string, userId: number, id: number, data: Record<string, unknown>) => {
    assertUser(token, userId)
    const sets: string[] = []; const vals: unknown[] = []
    for (const k of ['account_name', 'bank_name', 'account_number', 'branch']) {
      if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]) }
    }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    getDb().prepare(`UPDATE bank_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    logActivity(userId, 'update', 'cashbank', id, `Updated bank account #${id}`)
    return true
  })

  ipcMain.handle('cashbank:bank:toggleActive', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const cur = getDb().prepare('SELECT is_active FROM bank_accounts WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!cur) throw new Error('Account not found')
    const ns = cur.is_active ? 0 : 1
    getDb().prepare('UPDATE bank_accounts SET is_active = ? WHERE id = ?').run(ns, id)
    logActivity(userId, 'update', 'cashbank', id, `${ns ? 'Activated' : 'Deactivated'} bank account #${id}`)
    return { is_active: ns }
  })
}

// =====================================================================
// CASH ACCOUNTS
// =====================================================================
function registerCashAccountHandlers() {
  ipcMain.handle('cashbank:cash:list', async () => {
    return getDb().prepare('SELECT * FROM cash_accounts ORDER BY account_name').all()
  })

  ipcMain.handle('cashbank:cash:create', async (_event, token: string, userId: number, data: {
    account_name: string; opening_balance?: number
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const ob = data.opening_balance ?? 0
      const result = getDb().prepare(`
        INSERT INTO cash_accounts (account_name, opening_balance, current_balance, is_active)
        VALUES (?, ?, ?, 1)
      `).run(data.account_name, ob, ob)
      const accId = Number(result.lastInsertRowid)
      if (ob > 0) {
        recordCashBankTransaction('cash', accId, new Date().toISOString().split('T')[0], 'receipt', ob, 'opening_balance', accId, `Opening balance ${data.account_name}`, userId)
      }
      logActivity(userId, 'create', 'cashbank', accId, `Created cash account ${data.account_name}`)
      return { id: accId }
    })
  })

  ipcMain.handle('cashbank:cash:update', async (_event, token: string, userId: number, id: number, data: Record<string, unknown>) => {
    assertUser(token, userId)
    if (data.account_name === undefined) throw new Error('No fields to update')
    getDb().prepare('UPDATE cash_accounts SET account_name = ? WHERE id = ?').run(data.account_name, id)
    logActivity(userId, 'update', 'cashbank', id, `Updated cash account #${id}`)
    return true
  })

  ipcMain.handle('cashbank:cash:toggleActive', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const cur = getDb().prepare('SELECT is_active FROM cash_accounts WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!cur) throw new Error('Account not found')
    const ns = cur.is_active ? 0 : 1
    getDb().prepare('UPDATE cash_accounts SET is_active = ? WHERE id = ?').run(ns, id)
    logActivity(userId, 'update', 'cashbank', id, `${ns ? 'Activated' : 'Deactivated'} cash account #${id}`)
    return { is_active: ns }
  })
}

// =====================================================================
// TRANSACTIONS
// =====================================================================
function registerTransactionHandlers() {
  ipcMain.handle('cashbank:transactions', async (_event, token: string, userId: number, data: {
    account_type: string; account_id: number; date_from?: string; date_to?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = ['cbt.account_type = ?', 'cbt.account_id = ?']
    const vals: unknown[] = [data.account_type, data.account_id]
    if (data.date_from) { where.push('cbt.date >= ?'); vals.push(data.date_from) }
    if (data.date_to) { where.push('cbt.date <= ?'); vals.push(data.date_to) }
    return getDb().prepare(`
      SELECT cbt.* FROM cash_bank_transactions cbt
      WHERE ${where.join(' AND ')}
      ORDER BY cbt.date ASC, cbt.created_at ASC
    `).all(...vals)
  })

  ipcMain.handle('cashbank:balances', async () => {
    const cashAccounts = getDb().prepare('SELECT id, account_name, current_balance, is_active FROM cash_accounts ORDER BY account_name').all()
    const bankAccounts = getDb().prepare('SELECT id, account_name, current_balance, is_active, bank_name FROM bank_accounts ORDER BY account_name').all()
    const cashTotal = (cashAccounts as Array<{ current_balance: number }>).reduce((s, a) => s + a.current_balance, 0)
    const bankTotal = (bankAccounts as Array<{ current_balance: number }>).reduce((s, a) => s + a.current_balance, 0)
    return { cash: cashAccounts, bank: bankAccounts, total_cash_position: round2(cashTotal + bankTotal) }
  })

  ipcMain.handle('cashbank:manualTransaction', async (_event, token: string, userId: number, data: {
    account_type: string; account_id: number; date: string
    transaction_type: string; amount: number; description?: string; category?: string
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      if (data.amount <= 0) throw new Error('Amount must be greater than zero')
      recordCashBankTransaction(
        data.account_type as 'cash' | 'bank', data.account_id, data.date,
        data.transaction_type as 'receipt' | 'payment',
        data.amount, 'manual', null, data.description ?? 'Manual entry', userId
      )

      // Journal entry
      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'manual_transaction', NULL, ?, ?)
      `).run(`JE-MAN-${Date.now()}`, data.date, data.description ?? 'Manual', userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)')

      const cat = data.category ?? 'other'
      if (data.transaction_type === 'receipt') {
        // Dr Cash/Bank, Cr appropriate income/equity account
        const crAccount = cat === 'owner_investment' ? getCoaId('3000') : cat === 'interest_income' ? getCoaId('4200') : getCoaId('4200')
        if (data.account_type === 'cash') {
          jeLine.run(jeId, getCoaId('1000'), data.amount, 0, 'Cash')
        } else {
          jeLine.run(jeId, getCoaId('1100'), data.amount, 0, 'Bank')
        }
        jeLine.run(jeId, crAccount, 0, data.amount, cat.replace(/_/g, ' '))
      } else {
        // Dr expense/equity, Cr Cash/Bank
        const drAccount = cat === 'owner_withdrawal' ? getCoaId('3000') : cat === 'bank_charges' ? getCoaId('5500') : getCoaId('5500')
        jeLine.run(jeId, drAccount, data.amount, 0, cat.replace(/_/g, ' '))
        if (data.account_type === 'cash') {
          jeLine.run(jeId, getCoaId('1000'), 0, data.amount, 'Cash')
        } else {
          jeLine.run(jeId, getCoaId('1100'), 0, data.amount, 'Bank')
        }
      }

      logActivity(userId, 'create', 'cashbank', null, `Manual ${data.transaction_type} ${data.amount}`)
      return true
    })
  })

  ipcMain.handle('cashbank:transfer', async (_event, token: string, userId: number, data: {
    from_type: string; from_id: number; to_type: string; to_id: number
    amount: number; date: string; description?: string
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      if (data.amount <= 0) throw new Error('Amount must be greater than zero')
      const desc = data.description ?? 'Fund transfer'

      // Transfer out from source
      recordCashBankTransaction(data.from_type as 'cash' | 'bank', data.from_id, data.date, 'transfer_out', data.amount, 'transfer', null, desc, userId)
      // Transfer in to destination
      recordCashBankTransaction(data.to_type as 'cash' | 'bank', data.to_id, data.date, 'transfer_in', data.amount, 'transfer', null, desc, userId)

      // Journal entry: Dr destination, Cr source
      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'transfer', NULL, ?, ?)
      `).run(`JE-TRF-${Date.now()}`, data.date, desc, userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)')

      const destAccount = data.to_type === 'cash' ? getCoaId('1000') : getCoaId('1100')
      const srcAccount = data.from_type === 'cash' ? getCoaId('1000') : getCoaId('1100')
      jeLine.run(jeId, destAccount, data.amount, 0, 'Destination')
      jeLine.run(jeId, srcAccount, 0, data.amount, 'Source')

      logActivity(userId, 'create', 'cashbank', null, `Transfer ${data.amount} from ${data.from_type}#${data.from_id} to ${data.to_type}#${data.to_id}`)
      return true
    })
  })
}

export function registerCashBankHandlers() {
  registerBankAccountHandlers()
  registerCashAccountHandlers()
  registerTransactionHandlers()
}
