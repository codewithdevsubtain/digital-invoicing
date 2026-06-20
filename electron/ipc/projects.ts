import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction, recordCashBankTransaction } from '../database/db.js'
import { recordStockMovement } from './inventory.js'
import { assertAuth } from './guard.js'

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateProjectCode(): string {
  const year = new Date().getFullYear()
  const row = getDb()
    .prepare("SELECT project_code FROM projects WHERE project_code LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`PRJ-${year}-%`) as { project_code: string } | undefined
  let seq = 1
  if (row) {
    const parts = row.project_code.split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `PRJ-${year}-${String(seq).padStart(4, '0')}`
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

// =====================================================================
// PROJECT CRUD
// =====================================================================
function registerProjectCRUD() {
  ipcMain.handle('projects:list', async (_event, token: string, userId: number, filters?: {
    customer_id?: number; status?: string; search?: string; date_from?: string; date_to?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = []
    const vals: unknown[] = []
    if (filters?.customer_id) { where.push('p.customer_id = ?'); vals.push(filters.customer_id) }
    if (filters?.status) { where.push('p.status = ?'); vals.push(filters.status) }
    if (filters?.search) { where.push('(p.project_name LIKE ? OR p.project_code LIKE ?)'); const s = `%${filters.search}%`; vals.push(s, s) }
    if (filters?.date_from) { where.push('p.start_date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('p.start_date <= ?'); vals.push(filters.date_to) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT p.*, c.name as customer_name,
        COALESCE((SELECT SUM(total_before_tax) FROM sales_invoices WHERE project_id = p.id AND payment_status != 'unpaid'), 0) as revenue_invoiced,
        COALESCE((SELECT SUM(total_cost - COALESCE((SELECT SUM(quantity_returned * unit_cost) FROM project_material_returns WHERE project_id = p.id), 0)) FROM project_materials_issued WHERE project_id = p.id), 0) as total_material_cost,
        COALESCE((SELECT SUM(daily_wage_amount) FROM project_labor_costs WHERE project_id = p.id), 0) as total_labor_cost,
        COALESCE((SELECT SUM(amount) FROM project_other_expenses WHERE project_id = p.id), 0) as total_other_expenses
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      ${wc}
      ORDER BY p.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('projects:get', async (_event, token: string, _userId: number, id: number) => {
    const project = getDb().prepare(`
      SELECT p.*, c.name as customer_name
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ?
    `).get(id) as Record<string, unknown> | undefined
    return project ?? null
  })

  ipcMain.handle('projects:create', async (_event, token: string, userId: number, data: {
    project_name: string; customer_id?: number; site_address?: string; description?: string
    start_date?: string; expected_end_date?: string; contract_value?: number; status?: string
  }) => {
    assertUser(token, userId)
    if (!data.project_name) throw new Error('Project name is required')
    const code = generateProjectCode()
    const result = getDb().prepare(`
      INSERT INTO projects (project_code, project_name, customer_id, site_address, description, start_date, expected_end_date, contract_value, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, data.project_name, data.customer_id ?? null, data.site_address ?? null, data.description ?? null,
      data.start_date ?? null, data.expected_end_date ?? null, data.contract_value ?? 0,
      data.status ?? 'quotation', userId
    )
    const projectId = Number(result.lastInsertRowid)
    logActivity(userId, 'create', 'projects', projectId, `Created project ${code} - ${data.project_name}`)
    return { id: projectId, project_code: code }
  })

  ipcMain.handle('projects:update', async (_event, token: string, userId: number, id: number, data: Record<string, unknown>) => {
    assertUser(token, userId)
    const allowed = ['project_name', 'customer_id', 'site_address', 'description', 'start_date', 'expected_end_date', 'contract_value', 'notes']
    const sets: string[] = []; const vals: unknown[] = []
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = ?`); vals.push(data[key]) }
    }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    logActivity(userId, 'update', 'projects', id, `Updated project #${id}`)
    return true
  })

  ipcMain.handle('projects:updateStatus', async (_event, token: string, userId: number, id: number, status: string) => {
    assertUser(token, userId)
    const valid = ['quotation', 'approved', 'in_progress', 'completed', 'on_hold', 'cancelled']
    if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`)
    const now = status === 'completed' ? ', actual_end_date = ?' : ''
    const endDate = status === 'completed' ? new Date().toISOString().split('T')[0] : null
    if (status === 'completed') {
      getDb().prepare(`UPDATE projects SET status = ?, actual_end_date = ? WHERE id = ?`).run(status, endDate, id)
    } else {
      getDb().prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, id)
    }
    logActivity(userId, 'update', 'projects', id, `Project #${id} status -> ${status}`)
    return true
  })
}

// =====================================================================
// MATERIAL ISSUANCE / RETURNS
// =====================================================================
function registerMaterialHandlers() {
  ipcMain.handle('projects:issueMaterial', async (_event, token: string, userId: number, data: {
    project_id: number; item_id: number; warehouse_id: number; quantity: number
    date: string; issued_to?: string; notes?: string; override_low_stock?: boolean
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const stock = getDb().prepare(
        'SELECT quantity_on_hand, average_cost FROM item_stock WHERE item_id = ? AND warehouse_id = ?'
      ).get(data.item_id, data.warehouse_id) as { quantity_on_hand: number; average_cost: number } | undefined

      if (!stock || stock.quantity_on_hand < data.quantity) {
        if (!data.override_low_stock) {
          const available = stock?.quantity_on_hand ?? 0
          return { error: 'insufficient_stock', message: `Only ${available} available, need ${data.quantity}` }
        }
      }

      const unitCost = stock?.average_cost ?? 0
      const totalCost = round2(data.quantity * unitCost)

      recordStockMovement(
        data.item_id, data.warehouse_id, 'project_issue',
        data.quantity, unitCost, 'project', data.project_id,
        data.date, data.notes ?? null, userId
      )

      getDb().prepare(`
        INSERT INTO project_materials_issued (project_id, item_id, warehouse_id, quantity_issued, unit_cost, total_cost, date, issued_to, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.project_id, data.item_id, data.warehouse_id, data.quantity, unitCost, totalCost, data.date, data.issued_to ?? null, data.notes ?? null, userId)

      logActivity(userId, 'create', 'projects', data.project_id, `Issued material item #${data.item_id}: ${data.quantity}`)
      return { success: true, unit_cost: unitCost, total_cost: totalCost }
    })
  })

  ipcMain.handle('projects:returnMaterial', async (_event, token: string, userId: number, data: {
    project_id: number; item_id: number; warehouse_id: number; quantity: number; date: string; notes?: string
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      recordStockMovement(
        data.item_id, data.warehouse_id, 'project_return',
        data.quantity, 0, 'project', data.project_id,
        data.date, data.notes ?? null, userId
      )
      getDb().prepare(`
        INSERT INTO project_material_returns (project_id, item_id, warehouse_id, quantity_returned, date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(data.project_id, data.item_id, data.warehouse_id, data.quantity, data.date, data.notes ?? null, userId)

      logActivity(userId, 'create', 'projects', data.project_id, `Returned material item #${data.item_id}: ${data.quantity}`)
      return true
    })
  })

  ipcMain.handle('projects:getMaterials', async (_event, token: string, _userId: number, projectId: number) => {
    const issued = getDb().prepare(`
      SELECT pmi.*, i.name as item_name, i.item_code, u.short_code as unit_short_code, w.name as warehouse_name
      FROM project_materials_issued pmi
      JOIN items i ON pmi.item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      JOIN warehouses w ON pmi.warehouse_id = w.id
      WHERE pmi.project_id = ?
      ORDER BY pmi.date DESC, pmi.created_at DESC
    `).all(projectId)

    const returns = getDb().prepare(`
      SELECT pmr.*, i.name as item_name, i.item_code, u.short_code as unit_short_code, w.name as warehouse_name
      FROM project_material_returns pmr
      JOIN items i ON pmr.item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      JOIN warehouses w ON pmr.warehouse_id = w.id
      WHERE pmr.project_id = ?
      ORDER BY pmr.date DESC, pmr.created_at DESC
    `).all(projectId)

    const issuedTotal = (issued as Array<{ total_cost: number }>).reduce((s, r) => s + r.total_cost, 0)
    const returnTotal = (returns as Array<{ quantity_returned: number; id: number }>).reduce((s, r) => s + 0, 0) // financial value not tracked on returns individually
    const netCost = issuedTotal

    return { issued, returns, issued_total: round2(issuedTotal), net_cost: round2(netCost) }
  })
}

// =====================================================================
// LABOR COSTS
// =====================================================================
function registerLaborHandlers() {
  ipcMain.handle('projects:addLaborCost', async (_event, token: string, userId: number, data: {
    project_id: number; employee_id?: number; date: string
    hours_worked?: number; rate_per_hour?: number; daily_wage_amount?: number; description?: string
  }) => {
    assertUser(token, userId)
    const dailyWage = data.daily_wage_amount ?? (data.hours_worked && data.rate_per_hour ? round2(data.hours_worked * data.rate_per_hour) : 0)
    const result = getDb().prepare(`
      INSERT INTO project_labor_costs (project_id, employee_id, date, hours_worked, rate_per_hour, daily_wage_amount, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.project_id, data.employee_id ?? null, data.date,
      data.hours_worked ?? 0, data.rate_per_hour ?? 0, dailyWage,
      data.description ?? null, userId
    )
    logActivity(userId, 'create', 'projects', data.project_id, `Added labor cost: ${dailyWage}`)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('projects:getLaborCosts', async (_event, token: string, _userId: number, projectId: number) => {
    const rows = getDb().prepare(`
      SELECT plc.*, e.full_name as employee_name
      FROM project_labor_costs plc
      LEFT JOIN employees e ON plc.employee_id = e.id
      WHERE plc.project_id = ?
      ORDER BY plc.date DESC, plc.created_at DESC
    `).all(projectId)
    const total = (rows as Array<{ daily_wage_amount: number }>).reduce((s, r) => s + r.daily_wage_amount, 0)
    return { rows, total: round2(total) }
  })
}

// =====================================================================
// OTHER EXPENSES
// =====================================================================
function registerExpenseHandlers() {
  ipcMain.handle('projects:addExpense', async (_event, token: string, userId: number, data: {
    project_id: number; expense_category: string; description?: string; amount: number; date: string
    paid_via?: string; bank_account_id?: number
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const result = getDb().prepare(`
        INSERT INTO project_other_expenses (project_id, expense_category, description, amount, date, paid_via, bank_account_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.project_id, data.expense_category, data.description ?? null, data.amount, data.date,
        data.paid_via ?? null, data.bank_account_id ?? null, userId
      )
      const expenseId = Number(result.lastInsertRowid)

      // If paid via cash/bank, record transaction and journal entry
      if (data.paid_via === 'cash' || data.paid_via === 'bank') {
        const accountType = data.paid_via === 'cash' ? 'cash' : 'bank'
        if (accountType === 'bank' && !data.bank_account_id) {
          throw new Error('Bank account is required for bank payments')
        }
        const accountId = data.bank_account_id
          ?? (getDb().prepare('SELECT id FROM cash_accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined)?.id

        if (accountId) {
          recordCashBankTransaction(accountType, accountId, data.date, 'payment', data.amount, 'project_expense', expenseId, data.description ?? data.expense_category, userId)
        }

        // Journal entry: Dr Project Expense, Cr Cash/Bank
        const jeResult = getDb().prepare(`
          INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
          VALUES (?, ?, 'project_expense', ?, ?, ?)
        `).run(
          `JE-PEXP-${expenseId}`, data.date, expenseId,
          `Project expense: ${data.description ?? data.expense_category}`, userId
        )
        const jeId = Number(jeResult.lastInsertRowid)
        const jeLine = getDb().prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
        )
        jeLine.run(jeId, getCoaId('5300'), data.amount, 0, `Project expense`)
        if (data.paid_via === 'cash') {
          jeLine.run(jeId, getCoaId('1000'), 0, data.amount, `Cash`)
        } else {
          jeLine.run(jeId, getCoaId('1100'), 0, data.amount, `Bank`)
        }
      }

      logActivity(userId, 'create', 'projects', data.project_id, `Added expense ${data.expense_category}: ${data.amount}`)
      return { id: expenseId }
    })
  })

  ipcMain.handle('projects:getExpenses', async (_event, token: string, _userId: number, projectId: number) => {
    const rows = getDb().prepare(`
      SELECT * FROM project_other_expenses WHERE project_id = ? ORDER BY date DESC, created_at DESC
    `).all(projectId)
    const total = (rows as Array<{ amount: number }>).reduce((s, r) => s + r.amount, 0)
    return { rows, total: round2(total) }
  })
}

// =====================================================================
// PROFITABILITY
// =====================================================================
function registerProfitabilityHandlers() {
  ipcMain.handle('projects:profitability', async (_event, token: string, _userId: number, projectId: number) => {
    // Revenue from sales invoices (total_before_tax = tax-exclusive amount)
    const revenueRow = getDb().prepare(
      "SELECT COALESCE(SUM(total_before_tax), 0) as rev FROM sales_invoices WHERE project_id = ? AND is_voided = 0"
    ).get(projectId) as { rev: number }

    // Material cost
    const matCostRow = getDb().prepare(
      "SELECT COALESCE(SUM(total_cost), 0) as cost FROM project_materials_issued WHERE project_id = ?"
    ).get(projectId) as { cost: number }

    const matReturnRow = getDb().prepare(
      "SELECT COALESCE(SUM(quantity_returned), 0) as qty FROM project_material_returns WHERE project_id = ?"
    ).get(projectId) as { qty: number }

    // Approximate returns value using average cost of issued items
    const issuedCount = getDb().prepare(
      "SELECT COALESCE(SUM(quantity_issued), 0) as qty, COALESCE(SUM(total_cost), 0) as cost FROM project_materials_issued WHERE project_id = ?"
    ).get(projectId) as { qty: number; cost: number }
    const avgCost = issuedCount.qty > 0 ? issuedCount.cost / issuedCount.qty : 0
    const returnValue = round2(matReturnRow.qty * avgCost)

    const laborRow = getDb().prepare(
      "SELECT COALESCE(SUM(daily_wage_amount), 0) as cost FROM project_labor_costs WHERE project_id = ?"
    ).get(projectId) as { cost: number }

    const expenseRow = getDb().prepare(
      "SELECT COALESCE(SUM(amount), 0) as cost FROM project_other_expenses WHERE project_id = ?"
    ).get(projectId) as { cost: number }

    const revenue = revenueRow.rev
    const materialCost = round2(matCostRow.cost - returnValue)
    const laborCost = laborRow.cost
    const otherExpenses = expenseRow.cost
    const totalCosts = round2(materialCost + laborCost + otherExpenses)
    const grossProfit = round2(revenue - totalCosts)
    const profitMargin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0

    return {
      revenue,
      material_cost: materialCost,
      labor_cost: laborCost,
      other_expenses: otherExpenses,
      total_costs: totalCosts,
      gross_profit: grossProfit,
      profit_margin_percent: profitMargin,
    }
  })

  ipcMain.handle('projects:summary', async (_event, token: string, _userId: number) => {
    const active = getDb().prepare(
      "SELECT COUNT(*) as c FROM projects WHERE status IN ('approved', 'in_progress')"
    ).get() as { c: number }

    const contractValue = getDb().prepare(
      "SELECT COALESCE(SUM(contract_value), 0) as total FROM projects"
    ).get() as { total: number }

    const invoiced = getDb().prepare(
      "SELECT COALESCE(SUM(total_before_tax), 0) as total FROM sales_invoices WHERE is_voided = 0"
    ).get() as { total: number }

    return {
      active_projects: active.c,
      total_contract_value: contractValue.total,
      total_revenue_invoiced: invoiced.total,
    }
  })
}

export function registerProjectHandlers() {
  registerProjectCRUD()
  registerMaterialHandlers()
  registerLaborHandlers()
  registerExpenseHandlers()
  registerProfitabilityHandlers()
}
