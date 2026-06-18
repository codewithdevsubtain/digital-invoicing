import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction } from '../database/db.js'

function assertUser(userId: number) {
  const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: number } | undefined
  if (!user) throw new Error('Invalid user')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

function generateEmployeeCode(): string {
  const row = getDb().prepare("SELECT employee_code FROM employees WHERE employee_code LIKE 'EMP-%' ORDER BY id DESC LIMIT 1").get() as { employee_code: string } | undefined
  let seq = 1
  if (row) { const n = parseInt(row.employee_code.split('-')[1], 10); seq = n + 1 }
  return `EMP-${String(seq).padStart(3, '0')}`
}

// =====================================================================
// EMPLOYEES
// =====================================================================
function registerEmployeeHandlers() {
  ipcMain.handle('hr:employees:list', async (_event, userId: number, filters?: { designation?: string; is_active?: boolean | null }) => {
    assertUser(userId)
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.designation) { where.push('designation = ?'); vals.push(filters.designation) }
    if (filters?.is_active !== null && filters?.is_active !== undefined) { where.push('is_active = ?'); vals.push(filters.is_active ? 1 : 0) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`SELECT * FROM employees ${wc} ORDER BY full_name`).all(...vals)
  })

  ipcMain.handle('hr:employees:get', async (_event, _userId: number, id: number) => {
    return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(id) ?? null
  })

  ipcMain.handle('hr:employees:create', async (_event, userId: number, data: {
    full_name: string; designation: string; phone?: string; cnic?: string; address?: string
    joining_date?: string; salary_type: string; monthly_salary?: number; daily_rate?: number
  }) => {
    assertUser(userId)
    if (!data.full_name) throw new Error('Employee name is required')
    const code = generateEmployeeCode()
    const result = getDb().prepare(`
      INSERT INTO employees (employee_code, full_name, designation, phone, cnic, address, joining_date, salary_type, monthly_salary, daily_rate, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(code, data.full_name, data.designation, data.phone ?? null, data.cnic ?? null, data.address ?? null, data.joining_date ?? null, data.salary_type, data.monthly_salary ?? 0, data.daily_rate ?? 0)
    logActivity(userId, 'create', 'hr', Number(result.lastInsertRowid), `Created employee ${code} - ${data.full_name}`)
    return { id: result.lastInsertRowid, employee_code: code }
  })

  ipcMain.handle('hr:employees:update', async (_event, userId: number, id: number, data: Record<string, unknown>) => {
    assertUser(userId)
    const allowed = ['full_name', 'designation', 'phone', 'cnic', 'address', 'joining_date', 'salary_type', 'monthly_salary', 'daily_rate']
    const sets: string[] = []; const vals: unknown[] = []
    for (const k of allowed) { if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k]) } }
    if (sets.length === 0) throw new Error('No fields to update')
    vals.push(id)
    getDb().prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    logActivity(userId, 'update', 'hr', id, `Updated employee #${id}`)
    return true
  })

  ipcMain.handle('hr:employees:toggleActive', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const e = getDb().prepare('SELECT is_active FROM employees WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!e) throw new Error('Employee not found')
    const ns = e.is_active ? 0 : 1
    getDb().prepare('UPDATE employees SET is_active = ? WHERE id = ?').run(ns, id)
    logActivity(userId, 'update', 'hr', id, `${ns ? 'Activated' : 'Deactivated'} employee #${id}`)
    return { is_active: ns }
  })
}

// =====================================================================
// ATTENDANCE
// =====================================================================
function registerAttendanceHandlers() {
  ipcMain.handle('hr:attendance:mark', async (_event, userId: number, data: {
    employee_id: number; date: string; status: string; overtime_hours?: number; notes?: string
  }) => {
    assertUser(userId)
    getDb().prepare(`
      INSERT INTO attendance (employee_id, date, status, overtime_hours, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, overtime_hours = excluded.overtime_hours, notes = excluded.notes
    `).run(data.employee_id, data.date, data.status, data.overtime_hours ?? 0, data.notes ?? null, userId)
    logActivity(userId, 'create', 'hr', data.employee_id, `Attendance: ${data.employee_id} on ${data.date} = ${data.status}`)
    return true
  })

  ipcMain.handle('hr:attendance:bulkMark', async (_event, userId: number, data: {
    date: string; entries: Array<{ employee_id: number; status: string; overtime_hours?: number }>
  }) => {
    assertUser(userId)
    runTransaction(() => {
      const stmt = getDb().prepare(`
        INSERT INTO attendance (employee_id, date, status, overtime_hours, created_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, overtime_hours = excluded.overtime_hours
      `)
      for (const e of data.entries) {
        stmt.run(e.employee_id, data.date, e.status, e.overtime_hours ?? 0, userId)
      }
    })
    logActivity(userId, 'create', 'hr', 0, `Bulk attendance for ${data.date}: ${data.entries.length} entries`)
    return true
  })

  ipcMain.handle('hr:attendance:list', async (_event, _userId: number, filters: {
    employee_id?: number; date_from?: string; date_to?: string
  }) => {
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.employee_id) { where.push('a.employee_id = ?'); vals.push(filters.employee_id) }
    if (filters?.date_from) { where.push('a.date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('a.date <= ?'); vals.push(filters.date_to) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT a.*, e.full_name as employee_name, e.designation
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      ${wc}
      ORDER BY a.date DESC, a.employee_id
    `).all(...vals)
  })

  ipcMain.handle('hr:attendance:summary', async (_event, _userId: number, data: {
    employee_id: number; month: string; year: number
  }) => {
    const prefix = `${data.year}-${String(Number(data.month)).padStart(2, '0')}`
    const rows = getDb().prepare(`
      SELECT status, COUNT(*) as count, SUM(overtime_hours) as total_ot
      FROM attendance WHERE employee_id = ? AND date LIKE ?
      GROUP BY status
    `).all(data.employee_id, `${prefix}%`) as Array<{ status: string; count: number; total_ot: number }>

    const summary: Record<string, number> = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 }
    let totalOt = 0
    for (const r of rows) {
      summary[r.status] = r.count
      totalOt += r.total_ot
    }
    const daysInMonth = new Date(data.year, Number(data.month), 0).getDate()
    // Days present equivalent: present=1, half_day=0.5, holiday counts as paid
    const daysPresentEq = (summary['present'] || 0) + (summary['half_day'] || 0) * 0.5 + (summary['holiday'] || 0)
    return { ...summary, total_overtime_hours: round2(totalOt), days_in_month: daysInMonth, days_present_equivalent: round2(daysPresentEq) }
  })
}

// =====================================================================
// SALARY & PAYROLL
// =====================================================================
function registerSalaryHandlers() {
  ipcMain.handle('hr:salary:preview', async (_event, _userId: number, data: {
    employee_id: number; month: string; year: number
  }) => {
    const emp = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(data.employee_id) as {
      salary_type: string; monthly_salary: number; daily_rate: number
    } | undefined
    if (!emp) throw new Error('Employee not found')

    const att = await getDb().prepare(`
      SELECT status, COUNT(*) as count, SUM(overtime_hours) as total_ot
      FROM attendance WHERE employee_id = ? AND date LIKE ? GROUP BY status
    `).all(data.employee_id, `${data.year}-${String(Number(data.month)).padStart(2, '0')}%`) as Array<{ status: string; count: number; total_ot: number }>

    const summary: Record<string, number> = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 }
    let totalOt = 0
    for (const r of att) { summary[r.status] = r.count; totalOt += r.total_ot }

    const daysPresentEq = (summary['present'] || 0) + (summary['half_day'] || 0) * 0.5 + (summary['holiday'] || 0)
    const daysInMonth = new Date(data.year, Number(data.month), 0).getDate()

    let basicSalary = 0; let hourlyRate = 0
    if (emp.salary_type === 'monthly') {
      hourlyRate = daysInMonth > 0 ? emp.monthly_salary / daysInMonth / 8 : 0
      basicSalary = daysPresentEq * (emp.monthly_salary / daysInMonth)
    } else {
      hourlyRate = emp.daily_rate / 8
      basicSalary = daysPresentEq * emp.daily_rate
    }
    const overtimeAmt = round2(totalOt * hourlyRate)
    basicSalary = round2(basicSalary)

    // Get pending advances
    const pendingAdv = getDb().prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM employee_advances WHERE employee_id = ? AND status = 'pending'"
    ).get(data.employee_id) as { total: number }

    return {
      employee_id: data.employee_id,
      salary_type: emp.salary_type,
      days_present_equivalent: daysPresentEq,
      days_in_month: daysInMonth,
      basic_salary: basicSalary,
      overtime_hours: totalOt,
      overtime_amount: overtimeAmt,
      pending_advances: round2(pendingAdv.total),
      gross_pay: basicSalary + overtimeAmt,
    }
  })

  ipcMain.handle('hr:salary:create', async (_event, userId: number, data: {
    employee_id: number; month: string; year: number
    basic_salary: number; days_present: number; overtime_amount: number
    deductions: number; advance_deduction: number; net_salary: number
    payment_date: string; paid_via: string; bank_account_id?: number
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const result = getDb().prepare(`
        INSERT INTO salary_payments (employee_id, month, year, basic_salary, days_present, overtime_amount, deductions, advance_deduction, net_salary, payment_date, paid_via, bank_account_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.employee_id, data.month, data.year, data.basic_salary, data.days_present, data.overtime_amount, data.deductions, data.advance_deduction, data.net_salary, data.payment_date, data.paid_via, data.bank_account_id ?? null, userId)
      const payId = Number(result.lastInsertRowid)

      // Mark advances
      if (data.advance_deduction > 0) {
        const advances = getDb().prepare(
          "SELECT id, amount FROM employee_advances WHERE employee_id = ? AND status = 'pending' ORDER BY date ASC"
        ).all(data.employee_id) as Array<{ id: number; amount: number }>

        let remaining = data.advance_deduction
        for (const adv of advances) {
          if (remaining <= 0) break
          const toAdjust = Math.min(adv.amount, remaining)
          remaining -= toAdjust
          getDb().prepare("UPDATE employee_advances SET status = 'adjusted' WHERE id = ?").run(adv.id)
        }
      }

      // Cash/bank transaction + journal entry
      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'salary_payment', ?, ?, ?)
      `).run(`JE-SAL-${payId}`, data.payment_date, payId, `Salary ${data.month}/${data.year} emp #${data.employee_id}`, userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)')

      jeLine.run(jeId, getCoaId('5400'), data.net_salary, 0, `Salaries - ${data.month}/${data.year}`)
      if (data.advance_deduction > 0) {
        jeLine.run(jeId, getCoaId('3000'), 0, data.advance_deduction, `Advance adjustment`)
      }
      if (data.paid_via === 'cash') {
        jeLine.run(jeId, getCoaId('1000'), 0, data.net_salary - data.advance_deduction, 'Cash')
      } else {
        jeLine.run(jeId, getCoaId('1100'), 0, data.net_salary - data.advance_deduction, 'Bank')
      }

      logActivity(userId, 'create', 'hr', payId, `Salary payment for emp #${data.employee_id}: ${data.net_salary}`)
      return { id: payId }
    })
  })

  ipcMain.handle('hr:salary:list', async (_event, _userId: number, filters?: {
    employee_id?: number; month?: string; year?: number
  }) => {
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.employee_id) { where.push('sp.employee_id = ?'); vals.push(filters.employee_id) }
    if (filters?.month) { where.push('sp.month = ?'); vals.push(filters.month) }
    if (filters?.year) { where.push('sp.year = ?'); vals.push(filters.year) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT sp.*, e.full_name as employee_name, e.designation
      FROM salary_payments sp
      JOIN employees e ON sp.employee_id = e.id
      ${wc}
      ORDER BY sp.year DESC, sp.month DESC, sp.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('hr:payroll:preview', async (_event, userId: number, data: { month: string; year: number }) => {
    assertUser(userId)
    const employees = getDb().prepare("SELECT id, full_name, employee_code, designation, salary_type, monthly_salary, daily_rate FROM employees WHERE is_active = 1 ORDER BY full_name").all() as Array<{
      id: number; full_name: string; employee_code: string | null; designation: string
      salary_type: string; monthly_salary: number; daily_rate: number
    }>

    const results = []
    for (const emp of employees) {
      const preview = await getDb().prepare(`
        SELECT status, COUNT(*) as count, SUM(overtime_hours) as total_ot FROM attendance
        WHERE employee_id = ? AND date LIKE ? GROUP BY status
      `).all(emp.id, `${data.year}-${String(Number(data.month)).padStart(2, '0')}%`) as Array<{ status: string; count: number; total_ot: number }>

      const summary: Record<string, number> = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 }
      let totalOt = 0
      for (const r of preview) { summary[r.status] = r.count; totalOt += r.total_ot }

      const daysPresentEq = (summary['present'] || 0) + (summary['half_day'] || 0) * 0.5 + (summary['holiday'] || 0)
      const daysInMonth = new Date(data.year, Number(data.month), 0).getDate()

      let basicSalary = 0; let hourlyRate = 0
      if (emp.salary_type === 'monthly') {
        hourlyRate = daysInMonth > 0 ? emp.monthly_salary / daysInMonth / 8 : 0
        basicSalary = round2(daysPresentEq * (emp.monthly_salary / daysInMonth))
      } else {
        hourlyRate = emp.daily_rate / 8
        basicSalary = round2(daysPresentEq * emp.daily_rate)
      }
      const overtimeAmt = round2(totalOt * hourlyRate)

      const pendingAdv = (getDb().prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM employee_advances WHERE employee_id = ? AND status = 'pending'"
      ).get(emp.id) as { total: number }).total

      // Check if already paid
      const alreadyPaid = getDb().prepare(
        "SELECT COUNT(*) as c FROM salary_payments WHERE employee_id = ? AND month = ? AND year = ?"
      ).get(emp.id, data.month, data.year) as { c: number }

      results.push({
        employee_id: emp.id, employee_name: emp.full_name, employee_code: emp.employee_code,
        designation: emp.designation, salary_type: emp.salary_type,
        days_present_equivalent: daysPresentEq, basic_salary: basicSalary,
        overtime_hours: totalOt, overtime_amount: overtimeAmt,
        pending_advances: round2(pendingAdv),
        already_paid: alreadyPaid.c > 0,
        gross_pay: basicSalary + overtimeAmt,
      })
    }
    return results
  })
}

// =====================================================================
// EMPLOYEE ADVANCES
// =====================================================================
function registerAdvanceHandlers() {
  ipcMain.handle('hr:advances:give', async (_event, userId: number, data: {
    employee_id: number; date: string; amount: number; reason?: string
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const result = getDb().prepare(`
        INSERT INTO employee_advances (employee_id, date, amount, reason, status, created_by)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(data.employee_id, data.date, data.amount, data.reason ?? null, userId)
      const advId = Number(result.lastInsertRowid)

      getDb().prepare(`
        INSERT INTO cash_bank_transactions (account_type, account_id, date, transaction_type, amount, reference_type, reference_id, description, balance_after, created_by)
        VALUES ('cash', (SELECT id FROM cash_accounts WHERE is_active = 1 LIMIT 1), ?, 'payment', ?, 'employee_advance', ?, ?, ?, ?)
      `).run(data.date, -data.amount, advId, data.reason ?? 'Advance', -data.amount, userId)
      getDb().prepare('UPDATE cash_accounts SET current_balance = current_balance - ? WHERE is_active = 1').run(data.amount)

      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'employee_advance', ?, ?, ?)
      `).run(`JE-ADV-${advId}`, data.date, advId, `Advance emp #${data.employee_id}`, userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)')
      jeLine.run(jeId, getCoaId('3000'), data.amount, 0, 'Employee Advance')
      jeLine.run(jeId, getCoaId('1000'), 0, data.amount, 'Cash')

      logActivity(userId, 'create', 'hr', advId, `Advance for emp #${data.employee_id}: ${data.amount}`)
      return { id: advId }
    })
  })

  ipcMain.handle('hr:advances:list', async (_event, _userId: number, filters?: { employee_id?: number; status?: string }) => {
    const where: string[] = []; const vals: unknown[] = []
    if (filters?.employee_id) { where.push('ea.employee_id = ?'); vals.push(filters.employee_id) }
    if (filters?.status) { where.push('ea.status = ?'); vals.push(filters.status) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT ea.*, e.full_name as employee_name, e.employee_code
      FROM employee_advances ea
      JOIN employees e ON ea.employee_id = e.id
      ${wc}
      ORDER BY ea.date DESC
    `).all(...vals)
  })
}

export function registerHRHandlers() {
  registerEmployeeHandlers()
  registerAttendanceHandlers()
  registerSalaryHandlers()
  registerAdvanceHandlers()
}
