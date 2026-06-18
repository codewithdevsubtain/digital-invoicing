import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction } from '../database/db.js'

function assertUser(userId: number) {
  const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: number } | undefined
  if (!user) throw new Error('Invalid user')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateNumber(prefix: string): string {
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`
  const row = getDb()
    .prepare(`SELECT invoice_number FROM sales_invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(pattern) as { invoice_number: string } | undefined
  let seq = 1
  if (row) {
    const parts = row.invoice_number.split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

function generateReceiptNumber(): string {
  const year = new Date().getFullYear()
  const pattern = `RCT-${year}-%`
  const row = getDb()
    .prepare(`SELECT receipt_number FROM customer_receipts WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(pattern) as { receipt_number: string } | undefined
  let seq = 1
  if (row) {
    const parts = row.receipt_number.split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `RCT-${year}-${String(seq).padStart(4, '0')}`
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

// =====================================================================
// SALES INVOICES
// =====================================================================
function registerSalesInvoiceHandlers() {
  ipcMain.handle('sales:create', async (_event, userId: number, data: {
    customer_id: number; project_id?: number; date: string
    discount_percent?: number; discount_amount?: number
    further_tax_percent?: number; withholding_tax_percent?: number; notes?: string
    items: Array<{
      item_id?: number; description: string; quantity: number; unit?: string; rate: number
      gst_percent?: number
    }>
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const invNumber = generateNumber('INV')

      // Calculate line items
      let subtotal = 0
      const lineItems: Array<{
        item_id: number | null; description: string; quantity: number; unit: string | null
        rate: number; amount: number; gst_percent: number; gst_amount: number
      }> = []

      for (const item of data.items) {
        const amount = round2(item.quantity * item.rate)
        subtotal += amount
        const gstPct = item.gst_percent ?? 0
        const gstAmt = round2(amount * gstPct / 100)
        lineItems.push({
          item_id: item.item_id ?? null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? null,
          rate: item.rate,
          amount,
          gst_percent: gstPct,
          gst_amount: gstAmt,
        })
      }
      subtotal = round2(subtotal)

      // Discount
      const discPct = data.discount_percent ?? 0
      const discFlat = data.discount_amount ?? 0
      const discAmount = discFlat > 0 ? discFlat : round2(subtotal * discPct / 100)
      const totalBeforeTax = round2(subtotal - discAmount)

      // GST
      const gstTotal = lineItems.reduce((s, li) => s + li.gst_amount, 0)

      // Further Tax (on taxable amount)
      const ftPct = data.further_tax_percent ?? 0
      const ftAmount = round2(totalBeforeTax * ftPct / 100)

      // Total tax
      const totalTax = round2(gstTotal + ftAmount)

      // Grand total
      const grandTotal = round2(totalBeforeTax + totalTax)

      // WHT (memo - doesn't reduce grand total at invoice time)
      const whtPct = data.withholding_tax_percent ?? 0
      const whtAmount = round2(totalBeforeTax * whtPct / 100)

      // 1. Insert invoice
      const result = getDb().prepare(`
        INSERT INTO sales_invoices (invoice_number, project_id, customer_id, date, subtotal, discount_percent, discount_amount, gst_percent, gst_amount, further_tax_percent, further_tax_amount, withholding_tax_percent, withholding_tax_amount, total_before_tax, total_tax, grand_total, amount_received, balance_due, payment_status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invNumber, data.project_id ?? null, data.customer_id, data.date,
        subtotal, discPct, discAmount, 0, gstTotal, ftPct, ftAmount, whtPct, whtAmount,
        totalBeforeTax, totalTax, grandTotal, 0, grandTotal, 'unpaid', data.notes ?? null, userId
      )
      const invId = Number(result.lastInsertRowid)

      // 2. Insert line items
      const insItem = getDb().prepare(`
        INSERT INTO sales_invoice_items (sales_invoice_id, item_id, description, quantity, unit, rate, amount, gst_percent, gst_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const li of lineItems) {
        insItem.run(invId, li.item_id, li.description, li.quantity, li.unit, li.rate, li.amount, li.gst_percent, li.gst_amount)
      }

      // 3. Customer ledger entry (debit = increases receivable)
      getDb().prepare(`
        INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'invoice', ?, 'sales_invoice', ?, 0, ?, ?)
      `).run(data.customer_id, data.date, invId, grandTotal, grandTotal, `Invoice ${invNumber}`)

      // 4. Journal entry
      const arId = getCoaId('1200')    // Accounts Receivable
      const revId = getCoaId('4000')    // Sales Revenue
      const gstLiabId = getCoaId('2100')  // GST Payable
      const ftLiabId = getCoaId('2105')  // Further Tax Payable

      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'sales_invoice', ?, ?, ?)
      `).run(`JE-INV-${invId}`, data.date, invId, `Invoice ${invNumber}`, userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      jeLine.run(jeId, arId, grandTotal, 0, `Accounts Receivable - ${invNumber}`)
      jeLine.run(jeId, revId, 0, totalBeforeTax, `Sales Revenue - ${invNumber}`)
      if (gstTotal > 0) jeLine.run(jeId, gstLiabId, 0, gstTotal, `GST Output - ${invNumber}`)
      if (ftAmount > 0) jeLine.run(jeId, ftLiabId, 0, ftAmount, `Further Tax - ${invNumber}`)

      logActivity(userId, 'create', 'invoices', invId, `Created invoice ${invNumber}`)
      return { id: invId, invoice_number: invNumber, grand_total: grandTotal, withholding_tax_amount: whtAmount }
    })
  })

  ipcMain.handle('sales:list', async (_event, userId: number, filters?: {
    customer_id?: number; project_id?: number; payment_status?: string; date_from?: string; date_to?: string
  }) => {
    assertUser(userId)
    const where: string[] = ['si.is_voided = 0']
    const vals: unknown[] = []
    if (filters?.customer_id) { where.push('si.customer_id = ?'); vals.push(filters.customer_id) }
    if (filters?.project_id) { where.push('si.project_id = ?'); vals.push(filters.project_id) }
    if (filters?.payment_status) { where.push('si.payment_status = ?'); vals.push(filters.payment_status) }
    if (filters?.date_from) { where.push('si.date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('si.date <= ?'); vals.push(filters.date_to) }
    return getDb().prepare(`
      SELECT si.*, c.name as customer_name, p.project_name
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      LEFT JOIN projects p ON si.project_id = p.id
      WHERE ${where.join(' AND ')}
      ORDER BY si.date DESC, si.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('sales:getById', async (_event, _userId: number, id: number) => {
    const inv = getDb().prepare(`
      SELECT si.*, c.name as customer_name, c.address as customer_address, c.ntn as customer_ntn, c.strn as customer_strn,
             p.project_name
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      LEFT JOIN projects p ON si.project_id = p.id
      WHERE si.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!inv) return null
    const items = getDb().prepare(`
      SELECT sii.*, i.item_code
      FROM sales_invoice_items sii
      LEFT JOIN items i ON sii.item_id = i.id
      WHERE sii.sales_invoice_id = ?
      ORDER BY sii.id
    `).all(id)
    return { ...inv, items }
  })

  ipcMain.handle('sales:void', async (_event, userId: number, id: number, reason: string) => {
    assertUser(userId)
    return runTransaction(() => {
      const inv = getDb().prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!inv) throw new Error('Invoice not found')
      if (inv.is_voided) throw new Error('Already voided')
      if ((inv.amount_received as number) > 0) throw new Error('Cannot void invoice with receipts. Reverse receipts first.')

      // Reverse customer ledger entry
      const grandTotal = inv.grand_total as number
      getDb().prepare(`
        INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'credit_note', ?, 'sales_invoice_void', 0, ?, ?, ?)
      `).run(inv.customer_id, new Date().toISOString().split('T')[0], id, grandTotal, -grandTotal, `Void of ${inv.invoice_number} - ${reason}`)

      // Reverse journal
      const oldJe = getDb().prepare(
        "SELECT id FROM journal_entries WHERE reference_type = 'sales_invoice' AND reference_id = ?"
      ).get(id) as { id: number } | undefined
      if (oldJe) {
        const lines = getDb().prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?').all(oldJe.id) as Array<{
          account_id: number; debit: number; credit: number
        }>
        const jeResult = getDb().prepare(`
          INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
          VALUES (?, ?, 'sales_invoice_void', ?, ?, ?)
        `).run(`JE-INV-VOID-${id}`, new Date().toISOString().split('T')[0], id, `Void of ${inv.invoice_number} - ${reason}`, userId)
        const jeId = Number(jeResult.lastInsertRowid)
        const jeLine = getDb().prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
        )
        for (const line of lines) {
          jeLine.run(jeId, line.account_id, line.credit, line.debit, `Reversal: ${inv.invoice_number}`)
        }
      }

      getDb().prepare('UPDATE sales_invoices SET is_voided = 1, void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?').run(reason, id)
      logActivity(userId, 'void', 'invoices', id, `Voided invoice ${inv.invoice_number}: ${reason}`)
      return true
    })
  })

  ipcMain.handle('sales:projectMaterials', async (_event, userId: number, projectId: number) => {
    assertUser(userId)
    return getDb().prepare(`
      SELECT pmi.id, pmi.item_id, pmi.quantity_issued, pmi.unit_cost, pmi.total_cost,
             i.name as item_name, i.item_code, u.short_code as unit_short_code
      FROM project_materials_issued pmi
      JOIN items i ON pmi.item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE pmi.project_id = ?
      ORDER BY pmi.date DESC
    `).all(projectId)
  })
}

// =====================================================================
// CUSTOMER RECEIPTS
// =====================================================================
function registerReceiptHandlers() {
  ipcMain.handle('receipt:record', async (_event, userId: number, data: {
    customer_id: number; sales_invoice_id: number; date: string
    amount: number; payment_method: string; bank_account_id?: number; reference_no?: string; notes?: string
    withholding_tax_deducted?: number
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const receiptNumber = generateReceiptNumber()
      const whtDeducted = data.withholding_tax_deducted ?? 0
      const totalSettled = round2(data.amount + whtDeducted)

      // 1. Insert receipt
      const result = getDb().prepare(`
        INSERT INTO customer_receipts (receipt_number, customer_id, date, amount, payment_method, bank_account_id, reference_no, sales_invoice_id, notes, created_by, withholding_tax_deducted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptNumber, data.customer_id, data.date, data.amount,
        data.payment_method, data.bank_account_id ?? null, data.reference_no ?? null,
        data.sales_invoice_id, data.notes ?? null, userId, whtDeducted
      )
      const receiptId = Number(result.lastInsertRowid)

      // 2. Update invoice
      const inv = getDb().prepare('SELECT grand_total, amount_received, withholding_tax_amount FROM sales_invoices WHERE id = ?')
        .get(data.sales_invoice_id) as { grand_total: number; amount_received: number; withholding_tax_amount: number } | undefined
      if (!inv) throw new Error('Invoice not found')

      const newReceived = round2(inv.amount_received + data.amount)
      const newWhtTotal = round2(whtDeducted + 0) // could track cumulative
      const newBalance = round2(inv.grand_total - newReceived - whtDeducted)
      const newStatus = newBalance <= 0.01 ? 'paid' : newReceived > 0 ? 'partial' : 'unpaid'

      getDb().prepare(`
        UPDATE sales_invoices SET amount_received = ?, balance_due = ?, payment_status = ? WHERE id = ?
      `).run(newReceived, newBalance, newStatus, data.sales_invoice_id)

      // 3. Customer ledger (credit = reduces receivable by total settled)
      getDb().prepare(`
        INSERT INTO customer_ledger (customer_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'receipt', ?, 'customer_receipt', 0, ?, ?, ?)
      `).run(data.customer_id, data.date, receiptId, totalSettled, -totalSettled, `Receipt ${receiptNumber}`)

      // 4. Cash/bank transaction + journal entry
      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'customer_receipt', ?, ?, ?)
      `).run(`JE-RCT-${receiptId}`, data.date, receiptId, `Receipt ${receiptNumber}`, userId)
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      const arId = getCoaId('1200')  // Accounts Receivable

      if (data.payment_method === 'cash') {
        const cashAcc = getDb().prepare('SELECT id FROM cash_accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        if (cashAcc) {
          getDb().prepare(`
            INSERT INTO cash_bank_transactions (account_type, account_id, date, transaction_type, amount, reference_type, reference_id, description, balance_after, created_by)
            VALUES ('cash', ?, ?, 'receipt', ?, 'customer_receipt', ?, ?, ?, ?)
          `).run(cashAcc.id, data.date, data.amount, receiptId, `Receipt ${receiptNumber}`, data.amount, userId)
          getDb().prepare('UPDATE cash_accounts SET current_balance = current_balance + ? WHERE id = ?').run(data.amount, cashAcc.id)
        }
        jeLine.run(jeId, getCoaId('1000'), data.amount, 0, `Cash - ${receiptNumber}`)
      } else if (data.bank_account_id) {
        jeLine.run(jeId, getCoaId('1100'), data.amount, 0, `Bank - ${receiptNumber}`)
      } else {
        jeLine.run(jeId, getCoaId('1100'), data.amount, 0, `Bank - ${receiptNumber}`)
      }

      // Accounts Receivable credit for total settled
      jeLine.run(jeId, arId, 0, totalSettled, `Accounts Receivable - ${receiptNumber}`)

      // If WHT deducted, record tax receivable
      if (whtDeducted > 0) {
        jeLine.run(jeId, getCoaId('1500'), whtDeducted, 0, `WHT Deducted - ${receiptNumber}`)
      }

      logActivity(userId, 'create', 'invoices', receiptId, `Recorded receipt ${receiptNumber} for ${data.amount}`)
      return { id: receiptId, receipt_number: receiptNumber }
    })
  })

  ipcMain.handle('receipt:list', async (_event, userId: number, filters?: {
    customer_id?: number; sales_invoice_id?: number; date_from?: string; date_to?: string
  }) => {
    assertUser(userId)
    const where: string[] = []
    const vals: unknown[] = []
    if (filters?.customer_id) { where.push('cr.customer_id = ?'); vals.push(filters.customer_id) }
    if (filters?.sales_invoice_id) { where.push('cr.sales_invoice_id = ?'); vals.push(filters.sales_invoice_id) }
    if (filters?.date_from) { where.push('cr.date >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('cr.date <= ?'); vals.push(filters.date_to) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT cr.*, c.name as customer_name, si.invoice_number
      FROM customer_receipts cr
      JOIN customers c ON cr.customer_id = c.id
      JOIN sales_invoices si ON cr.sales_invoice_id = si.id
      ${wc}
      ORDER BY cr.date DESC, cr.created_at DESC
    `).all(...vals)
  })
}

export function registerInvoiceHandlers() {
  registerSalesInvoiceHandlers()
  registerReceiptHandlers()
}
