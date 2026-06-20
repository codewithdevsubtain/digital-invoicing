import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction, recordCashBankTransaction } from '../database/db.js'
import { recordStockMovement } from './inventory.js'
import { assertAuth } from './guard.js'

/*
 * VENDOR LEDGER SIGN CONVENTION:
 *   debit  = reduction in what we owe (payment, debit note)
 *   credit = increase in what we owe (purchase invoice)
 *   balance_after = debit - credit
 *     positive = vendor owes us (asset)
 *     negative = we owe vendor (liability / payables)
 *
 * JOURNAL ENTRY CONVENTION:
 *   Dr = debit entry, Cr = credit entry, using standard double-entry.
 */

function assertUser(token: string, userId: number) {
  assertAuth(token, userId)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateNumber(prefix: string, table: string, column: string): string {
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`
  const row = getDb()
    .prepare(`SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(pattern) as Record<string, string> | undefined
  let seq = 1
  if (row) {
    const parts = row[column].split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

// =====================================================================
// CHART OF ACCOUNTS LOOKUPS
// =====================================================================
function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found. Run seed data.`)
  return row.id
}

// =====================================================================
// PURCHASE ORDERS
// =====================================================================
function registerPurchaseOrderHandlers() {
  ipcMain.handle('po:create', async (_event, token: string, userId: number, data: {
    vendor_id: number; date: string; notes?: string
    items: Array<{ item_id: number; quantity: number; rate: number }>
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const poNumber = generateNumber('PO', 'purchase_orders', 'po_number')
      const result = getDb().prepare(
        'INSERT INTO purchase_orders (po_number, vendor_id, date, notes, created_by) VALUES (?, ?, ?, ?, ?)'
      ).run(poNumber, data.vendor_id, data.date, data.notes ?? null, userId)
      const poId = Number(result.lastInsertRowid)

      const insertItem = getDb().prepare(
        'INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)'
      )
      for (const item of data.items) {
        const amount = round2(item.quantity * item.rate)
        insertItem.run(poId, item.item_id, item.quantity, item.rate, amount)
      }

      logActivity(userId, 'create', 'purchases', poId, `Created PO ${poNumber}`)
      return { id: poId, po_number: poNumber }
    })
  })

  ipcMain.handle('po:list', async (_event, token: string, userId: number, filters?: { vendor_id?: number; status?: string; date_from?: string; date_to?: string }) => {
    assertUser(token, userId)
    const where: string[] = []
    const values: unknown[] = []
    if (filters?.vendor_id) { where.push('po.vendor_id = ?'); values.push(filters.vendor_id) }
    if (filters?.status) { where.push('po.status = ?'); values.push(filters.status) }
    if (filters?.date_from) { where.push('po.date >= ?'); values.push(filters.date_from) }
    if (filters?.date_to) { where.push('po.date <= ?'); values.push(filters.date_to) }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT po.*, v.name as vendor_name
      FROM purchase_orders po
      JOIN vendors v ON po.vendor_id = v.id
      ${whereClause}
      ORDER BY po.created_at DESC
    `).all(...values)
  })

  ipcMain.handle('po:getById', async (_event, token: string, _userId: number, id: number) => {
    const po = getDb().prepare(`
      SELECT po.*, v.name as vendor_name
      FROM purchase_orders po
      JOIN vendors v ON po.vendor_id = v.id
      WHERE po.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!po) return null
    const items = getDb().prepare(`
      SELECT poi.*, i.name as item_name, i.item_code
      FROM purchase_order_items poi
      JOIN items i ON poi.item_id = i.id
      WHERE poi.purchase_order_id = ?
    `).all(id)
    return { ...po, items }
  })

  ipcMain.handle('po:update', async (_event, token: string, userId: number, id: number, data: {
    vendor_id?: number; date?: string; notes?: string; status?: string
    items?: Array<{ item_id: number; quantity: number; rate: number }>
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const sets: string[] = []
      const vals: unknown[] = []
      if (data.vendor_id !== undefined) { sets.push('vendor_id = ?'); vals.push(data.vendor_id) }
      if (data.date !== undefined) { sets.push('date = ?'); vals.push(data.date) }
      if (data.notes !== undefined) { sets.push('notes = ?'); vals.push(data.notes) }
      if (data.status !== undefined) { sets.push('status = ?'); vals.push(data.status) }
      if (sets.length) {
        vals.push(id)
        getDb().prepare(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
      }
      if (data.items) {
        getDb().prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id)
        const ins = getDb().prepare('INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)')
        for (const item of data.items) {
          ins.run(id, item.item_id, item.quantity, item.rate, round2(item.quantity * item.rate))
        }
      }
      logActivity(userId, 'update', 'purchases', id, `Updated PO #${id}`)
      return true
    })
  })

  ipcMain.handle('po:updateStatus', async (_event, token: string, userId: number, id: number, status: string) => {
    assertUser(token, userId)
    getDb().prepare('UPDATE purchase_orders SET status = ? WHERE id = ?').run(status, id)
    logActivity(userId, 'update', 'purchases', id, `PO #${id} status -> ${status}`)
    return true
  })

  ipcMain.handle('po:delete', async (_event, token: string, userId: number, id: number) => {
    assertUser(token, userId)
    const po = getDb().prepare('SELECT status FROM purchase_orders WHERE id = ?').get(id) as { status: string } | undefined
    if (!po) throw new Error('PO not found')
    if (po.status !== 'draft') throw new Error('Only draft POs can be deleted')
    getDb().prepare('DELETE FROM purchase_orders WHERE id = ?').run(id)
    logActivity(userId, 'delete', 'purchases', id, `Deleted PO #${id}`)
    return true
  })
}

// =====================================================================
// PURCHASE INVOICES
// =====================================================================
function registerPurchaseInvoiceHandlers() {
  ipcMain.handle('pi:create', async (_event, token: string, userId: number, data: {
    vendor_id: number; vendor_invoice_no?: string; date: string; warehouse_id: number
    purchase_order_id?: number; notes?: string
    discount_percent?: number; gst_percent?: number; withholding_tax_percent?: number; other_charges?: number
    items: Array<{
      item_id: number; quantity: number; rate: number
      discount_percent?: number; gst_percent?: number
    }>
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const invNumber = generateNumber('PINV', 'purchase_invoices', 'invoice_number')

      // Calculate invoice totals
      let subtotal = 0
      const lineItems: Array<{
        item_id: number; quantity: number; rate: number
        discount_percent: number; amount: number
        gst_percent: number; gst_amount: number
      }> = []

      for (const item of data.items) {
        const lineTotal = item.quantity * item.rate
        const discPct = item.discount_percent ?? 0
        const discAmt = round2(lineTotal * discPct / 100)
        const amount = round2(lineTotal - discAmt)
        const gstPct = item.gst_percent ?? 0
        const gstAmt = round2(amount * gstPct / 100)
        subtotal += amount
        lineItems.push({
          item_id: item.item_id,
          quantity: item.quantity,
          rate: item.rate,
          discount_percent: discPct,
          amount,
          gst_percent: gstPct,
          gst_amount: gstAmt,
        })
      }

      subtotal = round2(subtotal)
      const discPct = data.discount_percent ?? 0
      const discAmt = round2(subtotal * discPct / 100)
      const afterDiscount = round2(subtotal - discAmt)
      const gstPct = data.gst_percent ?? 0
      const gstTotal = lineItems.reduce((sum, li) => sum + li.gst_amount, 0)
      const whtPct = data.withholding_tax_percent ?? 0
      // WHT is calculated on taxable amount (after discount)
      const whtAmt = round2(afterDiscount * whtPct / 100)
      const otherCharges = data.other_charges ?? 0
      const totalAmount = round2(afterDiscount + gstTotal + otherCharges - whtAmt)

      // 1. Insert the invoice
      const result = getDb().prepare(`
        INSERT INTO purchase_invoices (invoice_number, vendor_id, vendor_invoice_no, date, purchase_order_id, warehouse_id, subtotal, discount_percent, discount, gst_percent, gst_amount, withholding_tax_percent, withholding_tax_amount, other_charges, total_amount, payment_status, amount_paid, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?)
      `).run(
        invNumber, data.vendor_id, data.vendor_invoice_no ?? null, data.date,
        data.purchase_order_id ?? null, data.warehouse_id,
        subtotal, discPct, discAmt, gstPct, gstTotal, whtPct, whtAmt,
        otherCharges, totalAmount, data.notes ?? null, userId
      )
      const invId = Number(result.lastInsertRowid)

      // 2. Insert line items + record stock movements
      const insertItem = getDb().prepare(`
        INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, quantity, rate, discount_percent, amount, gst_percent, gst_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const li of lineItems) {
        insertItem.run(invId, li.item_id, li.quantity, li.rate, li.discount_percent, li.amount, li.gst_percent, li.gst_amount)
        recordStockMovement(
          li.item_id, data.warehouse_id, 'purchase_in',
          li.quantity, li.rate, 'purchase_invoice', invId,
          data.date, `Purchase invoice ${invNumber}`, userId
        )
      }

      // 3. Insert vendor ledger entry
      // Purchase: debit (increase what we owe)
      getDb().prepare(`
        INSERT INTO vendor_ledger (vendor_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'purchase', ?, 'purchase_invoice', 0, ?, ?, ?)
      `).run(
        data.vendor_id, data.date, invId, totalAmount, -totalAmount,
        `Purchase inv ${invNumber}`
      )

      // 4. Insert double-entry journal
      // Dr Inventory (subtotal - disc) = afterDiscount
      // Dr GST Input Receivable (gstTotal)
      // Cr Accounts Payable (totalAmount - whtAmt)
      // Cr Withholding Tax Payable (whtAmt)
      const invAssetId = getCoaId('1300') // Inventory - Raw Material
      const gstAssetId = getCoaId('1505') // GST Input Receivable
      const apLiabilityId = getCoaId('2000') // Accounts Payable
      const whtLiabilityId = getCoaId('2200') // WHT Payable

      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'purchase_invoice', ?, ?, ?)
      `).run(
        `JE-PINV-${invId}`, data.date, invId,
        `Purchase invoice ${invNumber} - ${data.vendor_invoice_no ?? ''}`, userId
      )
      const jeId = Number(jeResult.lastInsertRowid)

      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      jeLine.run(jeId, invAssetId, afterDiscount, 0, `Inventory - ${invNumber}`)
      if (gstTotal > 0) {
        jeLine.run(jeId, gstAssetId, gstTotal, 0, `GST Input - ${invNumber}`)
      }
      if (otherCharges > 0) {
        // Other charges to expense or add to inventory cost
        jeLine.run(jeId, getCoaId('5500'), otherCharges, 0, `Other charges - ${invNumber}`)
      }
      const apAmount = round2(totalAmount - whtAmt)
      jeLine.run(jeId, apLiabilityId, 0, apAmount, `Accounts Payable - ${invNumber}`)
      if (whtAmt > 0) {
        jeLine.run(jeId, whtLiabilityId, 0, whtAmt, `WHT Payable - ${invNumber}`)
      }

      logActivity(userId, 'create', 'purchases', invId, `Created purchase invoice ${invNumber}`)
      return { id: invId, invoice_number: invNumber }
    })
  })

  ipcMain.handle('pi:list', async (_event, token: string, userId: number, filters?: {
    vendor_id?: number; payment_status?: string; date_from?: string; date_to?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = ['pi.is_voided = 0']
    const values: unknown[] = []
    if (filters?.vendor_id) { where.push('pi.vendor_id = ?'); values.push(filters.vendor_id) }
    if (filters?.payment_status) { where.push('pi.payment_status = ?'); values.push(filters.payment_status) }
    if (filters?.date_from) { where.push('pi.date >= ?'); values.push(filters.date_from) }
    if (filters?.date_to) { where.push('pi.date <= ?'); values.push(filters.date_to) }
    return getDb().prepare(`
      SELECT pi.*, v.name as vendor_name,
        (pi.total_amount - pi.amount_paid) as balance_due
      FROM purchase_invoices pi
      JOIN vendors v ON pi.vendor_id = v.id
      WHERE ${where.join(' AND ')}
      ORDER BY pi.date DESC, pi.created_at DESC
    `).all(...values)
  })

  ipcMain.handle('pi:getById', async (_event, token: string, _userId: number, id: number) => {
    const inv = getDb().prepare(`
      SELECT pi.*, v.name as vendor_name,
        (pi.total_amount - pi.amount_paid) as balance_due
      FROM purchase_invoices pi
      JOIN vendors v ON pi.vendor_id = v.id
      WHERE pi.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!inv) return null
    const items = getDb().prepare(`
      SELECT pii.*, i.name as item_name, i.item_code, i.unit_id, u.short_code as unit_short_code
      FROM purchase_invoice_items pii
      JOIN items i ON pii.item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE pii.purchase_invoice_id = ?
    `).all(id)
    return { ...inv, items }
  })

  ipcMain.handle('pi:void', async (_event, token: string, userId: number, id: number, reason: string) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const inv = getDb().prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!inv) throw new Error('Invoice not found')
      if (inv.is_voided) throw new Error('Invoice is already voided')
      if ((inv.amount_paid as number) > 0) throw new Error('Cannot void an invoice with payments. Reverse payments first.')

      // Reverse stock movements
      const items = getDb().prepare('SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?').all(id) as Array<{
        item_id: number; quantity: number; rate: number
      }>
      const warehouseId = inv.warehouse_id as number
      for (const li of items) {
        recordStockMovement(
          li.item_id, warehouseId, 'adjustment_out',
          li.quantity, 0, 'purchase_invoice_void', id,
          new Date().toISOString().split('T')[0],
          `Void of invoice ${inv.invoice_number}`, userId
        )
      }

      // Reverse vendor ledger
      const totalAmount = inv.total_amount as number
      getDb().prepare(`
        INSERT INTO vendor_ledger (vendor_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'debit_note', ?, 'purchase_invoice_void', ?, 0, ?, ?)
      `).run(
        inv.vendor_id, new Date().toISOString().split('T')[0], id,
        totalAmount, totalAmount,
        `Void of ${inv.invoice_number} - ${reason}`
      )

      // Reverse journal entries
      const oldJe = getDb().prepare(
        "SELECT id FROM journal_entries WHERE reference_type = 'purchase_invoice' AND reference_id = ?"
      ).get(id) as { id: number } | undefined
      if (oldJe) {
        const lines = getDb().prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?').all(oldJe.id) as Array<{
          account_id: number; debit: number; credit: number
        }>
        const jeResult = getDb().prepare(`
          INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
          VALUES (?, ?, 'purchase_invoice_void', ?, ?, ?)
        `).run(
          `JE-PINV-VOID-${id}`, new Date().toISOString().split('T')[0], id,
          `Void of invoice ${inv.invoice_number} - ${reason}`, userId
        )
        const jeId = Number(jeResult.lastInsertRowid)
        const jeLine = getDb().prepare(
          'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
        )
        for (const line of lines) {
          // Swap debit/credit to reverse
          jeLine.run(jeId, line.account_id, line.credit, line.debit, `Reversal: ${inv.invoice_number}`)
        }
      }

      getDb().prepare(`
        UPDATE purchase_invoices SET is_voided = 1, void_reason = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(reason, id)

      logActivity(userId, 'void', 'purchases', id, `Voided invoice ${inv.invoice_number}: ${reason}`)
      return true
    })
  })
}

// =====================================================================
// VENDOR PAYMENTS
// =====================================================================
function registerPaymentHandlers() {
  ipcMain.handle('payment:record', async (_event, token: string, userId: number, data: {
    vendor_id: number; date: string; amount: number
    payment_method: string; bank_account_id?: number; reference_no?: string; notes?: string
    allocations: Array<{ purchase_invoice_id: number; amount: number }>
  }) => {
    assertUser(token, userId)
    return runTransaction(() => {
      const payNumber = generateNumber('VPAY', 'vendor_payments', 'payment_number')
      const totalAllocated = data.allocations.reduce((s, a) => s + a.amount, 0)
      if (Math.abs(totalAllocated - data.amount) > 0.01) {
        throw new Error(`Allocated amount (${totalAllocated}) must equal payment amount (${data.amount})`)
      }

      // 1. Insert payment
      const result = getDb().prepare(`
        INSERT INTO vendor_payments (payment_number, vendor_id, date, amount, payment_method, bank_account_id, reference_no, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payNumber, data.vendor_id, data.date, data.amount,
        data.payment_method, data.bank_account_id ?? null,
        data.reference_no ?? null, data.notes ?? null, userId
      )
      const payId = Number(result.lastInsertRowid)

      // 2. Insert allocations
      const allocIns = getDb().prepare(
        'INSERT INTO vendor_payment_allocations (payment_id, purchase_invoice_id, amount) VALUES (?, ?, ?)'
      )
      for (const alloc of data.allocations) {
        allocIns.run(payId, alloc.purchase_invoice_id, alloc.amount)
      }

      // 3. Update each invoice's payment status
      const invUpdate = getDb().prepare(
        'UPDATE purchase_invoices SET amount_paid = amount_paid + ?, payment_status = ? WHERE id = ?'
      )
      for (const alloc of data.allocations) {
        const inv = getDb().prepare('SELECT total_amount, amount_paid FROM purchase_invoices WHERE id = ?').get(alloc.purchase_invoice_id) as {
          total_amount: number; amount_paid: number
        }
        const newPaid = inv.amount_paid + alloc.amount
        const newStatus = newPaid >= inv.total_amount - 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'
        invUpdate.run(alloc.amount, newStatus, alloc.purchase_invoice_id)
      }

      // 4. Vendor ledger entry (debit = reduction in payables)
      getDb().prepare(`
        INSERT INTO vendor_ledger (vendor_id, date, transaction_type, reference_id, reference_type, debit, credit, balance_after, description)
        VALUES (?, ?, 'payment', ?, 'vendor_payment', ?, 0, ?, ?)
      `).run(
        data.vendor_id, data.date, payId, data.amount, data.amount,
        `Payment ${payNumber}`
      )

      // 5. Journal entry: Dr Accounts Payable, Cr Cash/Bank
      const apId = getCoaId('2000')
      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'vendor_payment', ?, ?, ?)
      `).run(
        `JE-VPAY-${payId}`, data.date, payId,
        `Payment ${payNumber} to vendor #${data.vendor_id}`, userId
      )
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      jeLine.run(jeId, apId, data.amount, 0, `Accounts Payable - ${payNumber}`)

      if (data.payment_method === 'cash') {
        const cashAcc = getDb().prepare('SELECT id FROM cash_accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        if (cashAcc) {
          recordCashBankTransaction('cash', cashAcc.id, data.date, 'payment', data.amount, 'vendor_payment', payId, `Payment ${payNumber}`, userId)
        }
        jeLine.run(jeId, getCoaId('1000'), 0, data.amount, `Cash - ${payNumber}`)
      } else {
        const bankId = data.bank_account_id
          ?? (getDb().prepare('SELECT id FROM bank_accounts WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined)?.id
        if (bankId) {
          recordCashBankTransaction('bank', bankId, data.date, 'payment', data.amount, 'vendor_payment', payId, `Payment ${payNumber}`, userId)
        }
        jeLine.run(jeId, getCoaId('1100'), 0, data.amount, `Bank - ${payNumber}`)
      }

      logActivity(userId, 'create', 'purchases', payId, `Recorded payment ${payNumber} for ${data.amount}`)
      return { id: payId, payment_number: payNumber }
    })
  })

  ipcMain.handle('payment:list', async (_event, token: string, userId: number, filters?: {
    vendor_id?: number; date_from?: string; date_to?: string
  }) => {
    assertUser(token, userId)
    const where: string[] = []
    const values: unknown[] = []
    if (filters?.vendor_id) { where.push('vp.vendor_id = ?'); values.push(filters.vendor_id) }
    if (filters?.date_from) { where.push('vp.date >= ?'); values.push(filters.date_from) }
    if (filters?.date_to) { where.push('vp.date <= ?'); values.push(filters.date_to) }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT vp.*, v.name as vendor_name
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id
      ${whereClause}
      ORDER BY vp.date DESC, vp.created_at DESC
    `).all(...values)
  })

  ipcMain.handle('payment:getById', async (_event, token: string, _userId: number, id: number) => {
    const pay = getDb().prepare(`
      SELECT vp.*, v.name as vendor_name
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id
      WHERE vp.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!pay) return null
    const allocations = getDb().prepare(`
      SELECT vpa.*, pi.invoice_number
      FROM vendor_payment_allocations vpa
      JOIN purchase_invoices pi ON vpa.purchase_invoice_id = pi.id
      WHERE vpa.payment_id = ?
    `).all(id)
    return { ...pay, allocations }
  })

  ipcMain.handle('pi:getOutstanding', async (_event, token: string, userId: number, vendorId: number) => {
    assertUser(token, userId)
    return getDb().prepare(`
      SELECT pi.id, pi.invoice_number, pi.date, pi.total_amount, pi.amount_paid,
        (pi.total_amount - pi.amount_paid) as balance_due
      FROM purchase_invoices pi
      WHERE pi.vendor_id = ? AND pi.is_voided = 0 AND pi.payment_status IN ('unpaid', 'partial')
      ORDER BY pi.date ASC
    `).all(vendorId)
  })
}

export function registerPurchaseHandlers() {
  registerPurchaseOrderHandlers()
  registerPurchaseInvoiceHandlers()
  registerPaymentHandlers()
}
