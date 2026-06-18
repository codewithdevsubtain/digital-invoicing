import { ipcMain, dialog } from 'electron'
import { getDb } from '../database/db.js'
import fs from 'fs'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// =====================================================================
// PROJECT PROFITABILITY REPORT
// =====================================================================
function registerProjectReport() {
  ipcMain.handle('reports:projectProfitability', async (_event, _userId: number, filters?: {
    date_from?: string; date_to?: string; status?: string
  }) => {
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.status) { where.push('p.status = ?'); vals.push(filters.status) }
    if (filters?.date_from) { where.push('p.created_at >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('p.created_at <= ?'); vals.push(filters.date_to) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const projects = getDb().prepare(`
      SELECT p.id, p.project_code, p.project_name, p.status, p.contract_value,
        c.name as customer_name,
        COALESCE((SELECT SUM(total_before_tax) FROM sales_invoices WHERE project_id = p.id AND is_voided = 0), 0) as total_revenue,
        COALESCE((SELECT SUM(total_cost) FROM project_materials_issued WHERE project_id = p.id), 0) as material_cost,
        COALESCE((SELECT SUM(daily_wage_amount) FROM project_labor_costs WHERE project_id = p.id), 0) as labor_cost,
        COALESCE((SELECT SUM(amount) FROM project_other_expenses WHERE project_id = p.id), 0) as other_expenses
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      ${wc}
      ORDER BY p.project_name
    `).all(...vals) as Array<{
      id: number; project_code: string; project_name: string; status: string
      contract_value: number; customer_name: string | null
      total_revenue: number; material_cost: number; labor_cost: number; other_expenses: number
    }>

    const result = projects.map((p) => {
      const totalCost = round2(p.material_cost + p.labor_cost + p.other_expenses)
      const netProfit = round2(p.total_revenue - totalCost)
      const margin = p.total_revenue > 0 ? round2((netProfit / p.total_revenue) * 100) : 0
      return { ...p, total_cost: totalCost, net_profit: netProfit, profit_margin_percent: margin }
    })

    const totals = result.reduce((s, r) => ({
      contract_value: round2(s.contract_value + r.contract_value),
      total_revenue: round2(s.total_revenue + r.total_revenue),
      material_cost: round2(s.material_cost + r.material_cost),
      labor_cost: round2(s.labor_cost + r.labor_cost),
      other_expenses: round2(s.other_expenses + r.other_expenses),
      total_cost: round2(s.total_cost + r.total_cost),
      net_profit: round2(s.net_profit + r.net_profit),
    }), { contract_value: 0, total_revenue: 0, material_cost: 0, labor_cost: 0, other_expenses: 0, total_cost: 0, net_profit: 0 }) as Record<string, number>

    totals.profit_margin_percent = totals.total_revenue > 0 ? round2((totals.net_profit / totals.total_revenue) * 100) : 0

    return { rows: result, totals }
  })
}

// =====================================================================
// RECEIVABLES / PAYABLES AGING
// =====================================================================
function registerAgingReports() {
  ipcMain.handle('reports:receivablesAging', async (_event, _userId: number, asOfDate: string) => {
    const asOf = new Date(asOfDate)
    const customers = getDb().prepare(`
      SELECT c.id, c.name,
        COALESCE((SELECT SUM(debit - credit) FROM customer_ledger WHERE customer_id = c.id), 0) as balance
      FROM customers c
      WHERE c.is_active = 1
      HAVING ABS(balance) > 0.01
      ORDER BY c.name
    `).all() as Array<{ id: number; name: string; balance: number }>

    return customers.map((c) => {
      const invoices = getDb().prepare(`
        SELECT date, grand_total, amount_received, (grand_total - amount_received) as due
        FROM sales_invoices WHERE customer_id = ? AND is_voided = 0 AND payment_status IN ('unpaid', 'partial')
        ORDER BY date
      `).all(c.id) as Array<{ date: string; grand_total: number; amount_received: number; due: number }>

      let current = 0, age31_60 = 0, age61_90 = 0, age90plus = 0
      for (const inv of invoices) {
        const days = Math.floor((asOf.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        if (days <= 30) current += inv.due
        else if (days <= 60) age31_60 += inv.due
        else if (days <= 90) age61_90 += inv.due
        else age90plus += inv.due
      }
      return {
        id: c.id, name: c.name, total_outstanding: round2(c.balance),
        current: round2(current), age31_60: round2(age31_60), age61_90: round2(age61_90), age90plus: round2(age90plus),
      }
    })
  })

  ipcMain.handle('reports:payablesAging', async (_event, _userId: number, asOfDate: string) => {
    const asOf = new Date(asOfDate)
    const vendors = getDb().prepare(`
      SELECT v.id, v.name,
        COALESCE((SELECT SUM(debit - credit) FROM vendor_ledger WHERE vendor_id = v.id), 0) as balance
      FROM vendors v
      WHERE v.is_active = 1
      HAVING balance < -0.01
      ORDER BY v.name
    `).all() as Array<{ id: number; name: string; balance: number }>

    return vendors.map((v) => {
      const invoices = getDb().prepare(`
        SELECT date, total_amount, amount_paid, (total_amount - amount_paid) as due
        FROM purchase_invoices WHERE vendor_id = ? AND is_voided = 0 AND payment_status IN ('unpaid', 'partial')
        ORDER BY date
      `).all(v.id) as Array<{ date: string; total_amount: number; amount_paid: number; due: number }>

      let current = 0, age31_60 = 0, age61_90 = 0, age90plus = 0
      for (const inv of invoices) {
        const days = Math.floor((asOf.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        if (days <= 30) current += inv.due
        else if (days <= 60) age31_60 += inv.due
        else if (days <= 90) age61_90 += inv.due
        else age90plus += inv.due
      }
      return {
        id: v.id, name: v.name, total_outstanding: round2(-v.balance),
        current: round2(current), age31_60: round2(age31_60), age61_90: round2(age61_90), age90plus: round2(age90plus),
      }
    })
  })
}

// =====================================================================
// INVENTORY REPORTS
// =====================================================================
function registerInventoryReports() {
  ipcMain.handle('reports:inventoryValuation', async (_event, _userId: number, _asOfDate: string, warehouse_id?: number) => {
    const where: string[] = ['i.is_active = 1']
    const vals: unknown[] = []
    if (warehouse_id) { where.push('is2.warehouse_id = ?'); vals.push(warehouse_id) }

    const items = getDb().prepare(`
      SELECT i.id, i.item_code, i.name, i.item_type, ic.name as category_name,
        COALESCE(SUM(is2.quantity_on_hand), 0) as quantity,
        COALESCE(AVG(is2.average_cost), 0) as avg_cost
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN item_stock is2 ON i.id = is2.item_id ${warehouse_id ? 'AND is2.warehouse_id = ?' : ''}
      WHERE ${where.join(' AND ')}
      GROUP BY i.id
      HAVING quantity > 0
      ORDER BY i.item_type, i.name
    `).all(...vals) as Array<{
      id: number; item_code: string; name: string; item_type: string
      category_name: string | null; quantity: number; avg_cost: number
    }>

    const result = items.map((i) => ({ ...i, total_value: round2(i.quantity * i.avg_cost) }))
    const grandTotal = round2(result.reduce((s, r) => s + r.total_value, 0))
    return { rows: result, grand_total: grandTotal }
  })

  ipcMain.handle('reports:movement', async (_event, _userId: number, filters: {
    item_id?: number; date_from: string; date_to: string
  }) => {
    const where: string[] = ['sm.date >= ?', 'sm.date <= ?']
    const vals: unknown[] = [filters.date_from, filters.date_to]
    if (filters?.item_id) { where.push('sm.item_id = ?'); vals.push(filters.item_id) }
    return getDb().prepare(`
      SELECT sm.*, i.item_code, i.name as item_name, w.name as warehouse_name, u.full_name as created_by_name
      FROM stock_movements sm
      JOIN items i ON sm.item_id = i.id
      JOIN warehouses w ON sm.warehouse_id = w.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY sm.date DESC, sm.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('reports:lowStock', async () => {
    return getDb().prepare(`
      SELECT i.id, i.item_code, i.name, i.item_type, i.reorder_level,
        u.name as unit_name, u.short_code as unit_short_code,
        COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) as current_stock
      FROM items i
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE i.is_active = 1 AND i.reorder_level > 0
        AND COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) < i.reorder_level
      ORDER BY (COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) * 1.0 / i.reorder_level) ASC
    `).all()
  })
}

// =====================================================================
// TAX REPORTS
// =====================================================================
function registerTaxReports() {
  ipcMain.handle('reports:salesTax', async (_event, _userId: number, data: { date_from: string; date_to: string }) => {
    // Output GST from sales invoices
    const outputTax = getDb().prepare(`
      SELECT strftime('%Y-%m', date) as month,
        SUM(grand_total) as total_sales,
        SUM(gst_amount) as gst_collected,
        SUM(further_tax_amount) as further_tax
      FROM sales_invoices WHERE date >= ? AND date <= ? AND is_voided = 0
      GROUP BY month ORDER BY month
    `).all(data.date_from, data.date_to) as Array<{ month: string; total_sales: number; gst_collected: number; further_tax: number }>

    // Input GST from purchase invoices
    const inputTax = getDb().prepare(`
      SELECT strftime('%Y-%m', date) as month,
        SUM(total_amount) as total_purchases,
        SUM(gst_amount) as gst_paid
      FROM purchase_invoices WHERE date >= ? AND date <= ? AND is_voided = 0
      GROUP BY month ORDER BY month
    `).all(data.date_from, data.date_to) as Array<{ month: string; total_purchases: number; gst_paid: number }>

    // Combine by month
    const months = new Set([...outputTax.map((r) => r.month), ...inputTax.map((r) => r.month)])
    const combined = Array.from(months).sort().map((month) => {
      const out = outputTax.find((r) => r.month === month)
      const inp = inputTax.find((r) => r.month === month)
      const outputAmt = round2((out?.gst_collected ?? 0) + (out?.further_tax ?? 0))
      const inputAmt = round2(inp?.gst_paid ?? 0)
      return {
        month,
        total_sales: round2(out?.total_sales ?? 0),
        gst_collected: round2(out?.gst_collected ?? 0),
        further_tax: round2(out?.further_tax ?? 0),
        total_output_tax: outputAmt,
        total_purchases: round2(inp?.total_purchases ?? 0),
        gst_paid: inputAmt,
        net_payable: round2(outputAmt - inputAmt),
      }
    })

    const totals = combined.reduce((s, r) => ({
      total_sales: round2(s.total_sales + r.total_sales),
      total_output_tax: round2(s.total_output_tax + r.total_output_tax),
      total_purchases: round2(s.total_purchases + r.total_purchases),
      total_input_tax: round2(s.total_input_tax + r.gst_paid),
      net_payable: round2(s.net_payable + r.net_payable),
    }), { total_sales: 0, total_output_tax: 0, total_purchases: 0, total_input_tax: 0, net_payable: 0 })

    return { rows: combined, totals }
  })

  ipcMain.handle('reports:wht', async (_event, _userId: number, data: { date_from: string; date_to: string }) => {
    // WHT on sales (customer withholds from us - we claim tax credit)
    const salesWHT = getDb().prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(withholding_tax_amount) as wht_amount
      FROM sales_invoices WHERE date >= ? AND date <= ? AND is_voided = 0 AND withholding_tax_amount > 0
      GROUP BY month ORDER BY month
    `).all(data.date_from, data.date_to) as Array<{ month: string; wht_amount: number }>

    // WHT on purchases (we withhold from vendor - we must deposit)
    const purchaseWHT = getDb().prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(withholding_tax_amount) as wht_amount
      FROM purchase_invoices WHERE date >= ? AND date <= ? AND is_voided = 0 AND withholding_tax_amount > 0
      GROUP BY month ORDER BY month
    `).all(data.date_from, data.date_to) as Array<{ month: string; wht_amount: number }>

    const months = new Set([...salesWHT.map((r) => r.month), ...purchaseWHT.map((r) => r.month)])
    const combined = Array.from(months).sort().map((month) => {
      const s = salesWHT.find((r) => r.month === month)
      const p = purchaseWHT.find((r) => r.month === month)
      return {
        month,
        wht_receivable: round2(s?.wht_amount ?? 0),
        wht_payable: round2(p?.wht_amount ?? 0),
        net_position: round2((s?.wht_amount ?? 0) - (p?.wht_amount ?? 0)),
      }
    })
    return { rows: combined }
  })
}

// =====================================================================
// EXPENSE BREAKDOWN & EMPLOYEE COST
// =====================================================================
function registerExpenseHrReports() {
  ipcMain.handle('reports:expenseBreakdown', async (_event, _userId: number, data: { date_from: string; date_to: string }) => {
    const rows = getDb().prepare(`
      SELECT ec.name as category, ec.type, SUM(ce.amount) as total
      FROM company_expenses ce
      JOIN expense_categories ec ON ce.category_id = ec.id
      WHERE ce.date >= ? AND ce.date <= ?
      GROUP BY ec.id ORDER BY total DESC
    `).all(data.date_from, data.date_to) as Array<{ category: string; type: string; total: number }>

    const grandTotal = round2(rows.reduce((s, r) => s + r.total, 0))
    return { rows: rows.map((r) => ({ ...r, total: round2(r.total), pct: grandTotal > 0 ? round2((r.total / grandTotal) * 100) : 0 })), grand_total: grandTotal }
  })

  ipcMain.handle('reports:employeeCost', async (_event, _userId: number, data: { month: string; year: number }) => {
    const prefix = `${data.year}-${String(Number(data.month)).padStart(2, '0')}`
    // Salary payments
    const salary = getDb().prepare(`
      SELECT sp.employee_id, e.full_name, e.designation, sp.net_salary
      FROM salary_payments sp
      JOIN employees e ON sp.employee_id = e.id
      WHERE sp.month = ? AND sp.year = ?
    `).all(data.month, data.year) as Array<{ employee_id: number; full_name: string; designation: string; net_salary: number }>

    // Project labor
    const labor = getDb().prepare(`
      SELECT plc.employee_id, e.full_name, e.designation, SUM(plc.daily_wage_amount) as total_labor
      FROM project_labor_costs plc
      JOIN employees e ON plc.employee_id = e.id
      WHERE plc.date LIKE ?
      GROUP BY plc.employee_id
    `).all(`${prefix}%`) as Array<{ employee_id: number; full_name: string; designation: string; total_labor: number }>

    const combined: Record<number, { employee_id: number; employee_name: string; designation: string; salary: number; project_labor: number }> = {}
    for (const s of salary) {
      combined[s.employee_id] = { employee_id: s.employee_id, employee_name: s.full_name, designation: s.designation, salary: s.net_salary, project_labor: 0 }
    }
    for (const l of labor) {
      if (combined[l.employee_id]) combined[l.employee_id].project_labor = l.total_labor
      else combined[l.employee_id] = { employee_id: l.employee_id, employee_name: l.full_name, designation: l.designation, salary: 0, project_labor: l.total_labor }
    }
    return Object.values(combined).map((r) => ({ ...r, total_cost: round2(r.salary + r.project_labor) }))
  })
}

// =====================================================================
// BUSINESS PERFORMANCE DASHBOARD DATA
// =====================================================================
function registerDashboardData() {
  ipcMain.handle('reports:dashboard', async (_event, _userId: number, data: { date_from?: string; date_to?: string }) => {
    const df = data.date_from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dt = data.date_to ?? new Date().toISOString().split('T')[0]

    const totalSales = (getDb().prepare(
      "SELECT COALESCE(SUM(grand_total), 0) as t FROM sales_invoices WHERE date >= ? AND date <= ? AND is_voided = 0"
    ).get(df, dt) as { t: number }).t

    const totalPurchases = (getDb().prepare(
      "SELECT COALESCE(SUM(total_amount), 0) as t FROM purchase_invoices WHERE date >= ? AND date <= ? AND is_voided = 0"
    ).get(df, dt) as { t: number }).t

    const totalExpenses = (getDb().prepare(
      "SELECT COALESCE(SUM(amount), 0) as t FROM company_expenses WHERE date >= ? AND date <= ?"
    ).get(df, dt) as { t: number }).t

    const totalReceivables = (getDb().prepare(
      "SELECT COALESCE(SUM(balance_due), 0) as t FROM sales_invoices WHERE is_voided = 0 AND payment_status IN ('unpaid', 'partial')"
    ).get() as { t: number }).t

    const totalPayables = (getDb().prepare(
      "SELECT COALESCE(SUM(total_amount - amount_paid), 0) as t FROM purchase_invoices WHERE is_voided = 0 AND payment_status IN ('unpaid', 'partial')"
    ).get() as { t: number }).t

    const cashPosition = (getDb().prepare(
      "SELECT COALESCE(SUM(current_balance), 0) as t FROM cash_accounts WHERE is_active = 1"
    ).get() as { t: number }).t + (getDb().prepare(
      "SELECT COALESCE(SUM(current_balance), 0) as t FROM bank_accounts WHERE is_active = 1"
    ).get() as { t: number }).t

    const inventoryValue = (getDb().prepare(
      "SELECT COALESCE(SUM(is2.quantity_on_hand * is2.average_cost), 0) as t FROM item_stock is2 JOIN items i ON is2.item_id = i.id WHERE i.is_active = 1"
    ).get() as { t: number }).t

    const activeProjects = (getDb().prepare(
      "SELECT COUNT(*) as c FROM projects WHERE status IN ('approved', 'in_progress')"
    ).get() as { c: number }).c

    // Top customers
    const topCustomers = getDb().prepare(`
      SELECT c.id, c.name, COALESCE(SUM(si.grand_total), 0) as revenue
      FROM customers c
      LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.date >= ? AND si.date <= ? AND si.is_voided = 0
      GROUP BY c.id ORDER BY revenue DESC LIMIT 5
    `).all(df, dt) as Array<{ id: number; name: string; revenue: number }>

    // Top projects by profit
    const topProjects = getDb().prepare(`
      SELECT p.id, p.project_code, p.project_name,
        COALESCE((SELECT SUM(total_before_tax) FROM sales_invoices WHERE project_id = p.id AND is_voided = 0), 0) as revenue,
        COALESCE((SELECT SUM(total_cost) FROM project_materials_issued WHERE project_id = p.id), 0) as mat_cost,
        COALESCE((SELECT SUM(daily_wage_amount) FROM project_labor_costs WHERE project_id = p.id), 0) as lab_cost,
        COALESCE((SELECT SUM(amount) FROM project_other_expenses WHERE project_id = p.id), 0) as exp_cost
      FROM projects p
      WHERE p.status IN ('approved', 'in_progress', 'completed')
      ORDER BY revenue DESC LIMIT 5
    `).all() as Array<{
      id: number; project_code: string; project_name: string
      revenue: number; mat_cost: number; lab_cost: number; exp_cost: number
    }>

    const topProjectsByProfit = topProjects.map((p) => {
      const totalCost = round2(p.mat_cost + p.lab_cost + p.exp_cost)
      const profit = round2(p.revenue - totalCost)
      const margin = p.revenue > 0 ? round2((profit / p.revenue) * 100) : 0
      return { ...p, total_cost: totalCost, profit, margin }
    })

    // Active projects list
    const activeProjectList = getDb().prepare(`
      SELECT id, project_code, project_name, status FROM projects WHERE status IN ('approved', 'in_progress') ORDER BY project_name
    `).all() as Array<{ id: number; project_code: string; project_name: string; status: string }>

    // Recent activity
    const recentActivity = getDb().prepare(`
      SELECT al.*, u.full_name as user_name FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC LIMIT 20
    `).all()

    return {
      total_sales: round2(totalSales),
      total_purchases: round2(totalPurchases),
      total_expenses: round2(totalExpenses),
      net_profit: round2(totalSales - totalPurchases - totalExpenses),
      active_projects_count: activeProjects,
      total_receivables: round2(totalReceivables),
      total_payables: round2(totalPayables),
      cash_position: round2(cashPosition),
      inventory_value: round2(inventoryValue),
      top_customers: topCustomers.map((c) => ({ ...c, revenue: round2(c.revenue) })),
      top_projects: topProjectsByProfit,
      active_projects: activeProjectList,
      recent_activity: recentActivity,
    }
  })
}

// =====================================================================
// CSV EXPORT
// =====================================================================
function registerExportHandler() {
  ipcMain.handle('reports:exportCSV', async (_event, _userId: number, data: { defaultName: string; headers: string[]; rows: string[][] }) => {
    const result = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: data.defaultName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) return false
    const csv = [data.headers.join(','), ...data.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    fs.writeFileSync(result.filePath, '\ufeff' + csv, 'utf-8') // BOM for Excel UTF-8
    return true
  })
}

export function registerReportHandlers() {
  registerProjectReport()
  registerAgingReports()
  registerInventoryReports()
  registerTaxReports()
  registerExpenseHrReports()
  registerDashboardData()
  registerExportHandler()
}
