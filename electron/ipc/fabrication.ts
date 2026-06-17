import { ipcMain } from 'electron'
import { getDb, logActivity, runTransaction } from '../database/db.js'
import { recordStockMovement } from './inventory.js'

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
    .prepare("SELECT fab_order_number FROM fabrication_orders WHERE fab_order_number LIKE ? ORDER BY id DESC LIMIT 1")
    .get(pattern) as { fab_order_number: string } | undefined
  let seq = 1
  if (row) {
    const parts = row.fab_order_number.split('-')
    seq = parseInt(parts[parts.length - 1], 10) + 1
  }
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

function getCoaId(code: string): number {
  const row = getDb().prepare('SELECT id FROM chart_of_accounts WHERE account_code = ?').get(code) as { id: number } | undefined
  if (!row) throw new Error(`Chart of account ${code} not found.`)
  return row.id
}

// =====================================================================
// BOM
// =====================================================================
function registerBOMHandlers() {
  ipcMain.handle('bom:create', async (_event, userId: number, data: {
    finished_item_id: number; name: string; output_quantity: number
    labor_cost_estimate?: number; overhead_cost_estimate?: number; notes?: string
    components: Array<{ raw_material_item_id: number; quantity_required: number; wastage_percent?: number }>
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const result = getDb().prepare(
        'INSERT INTO bom (finished_item_id, name, output_quantity, labor_cost_estimate, overhead_cost_estimate, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(data.finished_item_id, data.name, data.output_quantity, data.labor_cost_estimate ?? 0, data.overhead_cost_estimate ?? 0, data.notes ?? null)
      const bomId = Number(result.lastInsertRowid)

      const ins = getDb().prepare(
        'INSERT INTO bom_components (bom_id, raw_material_item_id, quantity_required, wastage_percent) VALUES (?, ?, ?, ?)'
      )
      for (const c of data.components) {
        ins.run(bomId, c.raw_material_item_id, c.quantity_required, c.wastage_percent ?? 0)
      }

      logActivity(userId, 'create', 'fabrication', bomId, `Created BOM ${data.name}`)
      return { id: bomId }
    })
  })

  ipcMain.handle('bom:list', async (_event, _userId: number, filters?: { finished_item_id?: number }) => {
    const where: string[] = []
    const values: unknown[] = []
    if (filters?.finished_item_id) {
      where.push('b.finished_item_id = ?'); values.push(filters.finished_item_id)
    }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT b.*, i.name as finished_item_name, i.item_code as finished_item_code
      FROM bom b
      JOIN items i ON b.finished_item_id = i.id
      ${whereClause}
      ORDER BY b.created_at DESC
    `).all(...values)
  })

  ipcMain.handle('bom:getById', async (_event, _userId: number, id: number) => {
    const bom = getDb().prepare(`
      SELECT b.*, i.name as finished_item_name, i.item_code as finished_item_code, i.unit_id, u.short_code as unit_short_code
      FROM bom b
      JOIN items i ON b.finished_item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE b.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!bom) return null
    const components = getDb().prepare(`
      SELECT bc.*, i.name as raw_material_name, i.item_code as raw_material_code, u.short_code as unit_short_code,
        COALESCE((SELECT average_cost FROM item_stock WHERE item_id = bc.raw_material_item_id LIMIT 1), 0) as current_avg_cost
      FROM bom_components bc
      JOIN items i ON bc.raw_material_item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE bc.bom_id = ?
    `).all(id)
    return { ...bom, components }
  })

  ipcMain.handle('bom:update', async (_event, userId: number, id: number, data: {
    name?: string; output_quantity?: number
    labor_cost_estimate?: number; overhead_cost_estimate?: number; notes?: string
    components?: Array<{ raw_material_item_id: number; quantity_required: number; wastage_percent?: number }>
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const sets: string[] = []; const vals: unknown[] = []
      if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name) }
      if (data.output_quantity !== undefined) { sets.push('output_quantity = ?'); vals.push(data.output_quantity) }
      if (data.labor_cost_estimate !== undefined) { sets.push('labor_cost_estimate = ?'); vals.push(data.labor_cost_estimate) }
      if (data.overhead_cost_estimate !== undefined) { sets.push('overhead_cost_estimate = ?'); vals.push(data.overhead_cost_estimate) }
      if (data.notes !== undefined) { sets.push('notes = ?'); vals.push(data.notes) }
      if (sets.length) { vals.push(id); getDb().prepare(`UPDATE bom SET ${sets.join(', ')} WHERE id = ?`).run(...vals) }
      if (data.components) {
        getDb().prepare('DELETE FROM bom_components WHERE bom_id = ?').run(id)
        const ins = getDb().prepare('INSERT INTO bom_components (bom_id, raw_material_item_id, quantity_required, wastage_percent) VALUES (?, ?, ?, ?)')
        for (const c of data.components) {
          ins.run(id, c.raw_material_item_id, c.quantity_required, c.wastage_percent ?? 0)
        }
      }
      logActivity(userId, 'update', 'fabrication', id, `Updated BOM #${id}`)
      return true
    })
  })

  ipcMain.handle('bom:deactivate', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const current = getDb().prepare('SELECT is_active FROM bom WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!current) throw new Error('BOM not found')
    const newStatus = current.is_active ? 0 : 1
    getDb().prepare('UPDATE bom SET is_active = ? WHERE id = ?').run(newStatus, id)
    logActivity(userId, 'update', 'fabrication', id, `${newStatus ? 'Activated' : 'Deactivated'} BOM #${id}`)
    return { is_active: newStatus }
  })

  ipcMain.handle('bom:costEstimate', async (_event, _userId: number, id: number) => {
    const bom = getDb().prepare('SELECT * FROM bom WHERE id = ?').get(id) as {
      output_quantity: number; labor_cost_estimate: number; overhead_cost_estimate: number
    } | undefined
    if (!bom) throw new Error('BOM not found')

    const components = getDb().prepare(`
      SELECT bc.*,
        COALESCE((SELECT average_cost FROM item_stock WHERE item_id = bc.raw_material_item_id LIMIT 1), 0) as current_avg_cost
      FROM bom_components bc WHERE bc.bom_id = ?
    `).all(id) as Array<{
      quantity_required: number; wastage_percent: number; current_avg_cost: number
    }>

    let materialCost = 0
    const details = components.map((c) => {
      const qtyWithWaste = c.quantity_required * (1 + (c.wastage_percent ?? 0) / 100)
      const cost = qtyWithWaste * c.current_avg_cost
      materialCost += cost
      return { ...c, qty_with_waste: qtyWithWaste, line_cost: round2(cost) }
    })

    const totalCost = materialCost + bom.labor_cost_estimate + bom.overhead_cost_estimate
    const costPerUnit = bom.output_quantity > 0 ? round2(totalCost / bom.output_quantity) : 0

    return {
      material_cost: round2(materialCost),
      labor_cost: bom.labor_cost_estimate,
      overhead_cost: bom.overhead_cost_estimate,
      total_cost: round2(totalCost),
      cost_per_unit: costPerUnit,
      details,
    }
  })
}

// =====================================================================
// FABRICATION ORDERS
// =====================================================================
function registerFabricationOrderHandlers() {
  ipcMain.handle('fab:create', async (_event, userId: number, data: {
    bom_id: number; quantity_to_produce: number; warehouse_id: number
    date_started?: string; notes?: string
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const bom = getDb().prepare('SELECT * FROM bom WHERE id = ?').get(data.bom_id) as {
        finished_item_id: number; output_quantity: number
      } | undefined
      if (!bom) throw new Error('BOM not found')

      const fabNumber = generateNumber('FAB')
      const result = getDb().prepare(`
        INSERT INTO fabrication_orders (fab_order_number, bom_id, finished_item_id, quantity_to_produce, warehouse_id, date_started, notes, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned')
      `).run(fabNumber, data.bom_id, bom.finished_item_id, data.quantity_to_produce, data.warehouse_id, data.date_started ?? null, data.notes ?? null, userId)
      const fabId = Number(result.lastInsertRowid)

      // Pre-populate materials from BOM components, scaled
      const components = getDb().prepare(`
        SELECT bc.*,
          COALESCE((SELECT average_cost FROM item_stock WHERE item_id = bc.raw_material_item_id LIMIT 1), 0) as current_avg_cost
        FROM bom_components bc WHERE bc.bom_id = ?
      `).all(data.bom_id) as Array<{
        raw_material_item_id: number; quantity_required: number; wastage_percent: number; current_avg_cost: number
      }>

      const scale = data.quantity_to_produce / bom.output_quantity
      const ins = getDb().prepare(
        'INSERT INTO fabrication_order_materials (fabrication_order_id, raw_material_item_id, quantity_consumed, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)'
      )
      for (const c of components) {
        const qtyConsumed = round2(c.quantity_required * scale)
        const totalCost = round2(qtyConsumed * c.current_avg_cost)
        ins.run(fabId, c.raw_material_item_id, qtyConsumed, c.current_avg_cost, totalCost)
      }

      logActivity(userId, 'create', 'fabrication', fabId, `Created fab order ${fabNumber}`)
      return { id: fabId, fab_order_number: fabNumber }
    })
  })

  ipcMain.handle('fab:list', async (_event, userId: number, filters?: {
    status?: string; date_from?: string; date_to?: string; finished_item_id?: number
  }) => {
    assertUser(userId)
    const where: string[] = []
    const vals: unknown[] = []
    if (filters?.status) { where.push('fo.status = ?'); vals.push(filters.status) }
    if (filters?.date_from) { where.push('fo.created_at >= ?'); vals.push(filters.date_from) }
    if (filters?.date_to) { where.push('fo.created_at <= ?'); vals.push(filters.date_to) }
    if (filters?.finished_item_id) { where.push('fo.finished_item_id = ?'); vals.push(filters.finished_item_id) }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : ''
    return getDb().prepare(`
      SELECT fo.*, i.name as finished_item_name, i.item_code as finished_item_code, b.name as bom_name, w.name as warehouse_name
      FROM fabrication_orders fo
      JOIN items i ON fo.finished_item_id = i.id
      JOIN bom b ON fo.bom_id = b.id
      JOIN warehouses w ON fo.warehouse_id = w.id
      ${wc}
      ORDER BY fo.created_at DESC
    `).all(...vals)
  })

  ipcMain.handle('fab:getById', async (_event, _userId: number, id: number) => {
    const order = getDb().prepare(`
      SELECT fo.*, i.name as finished_item_name, i.item_code as finished_item_code, b.name as bom_name, w.name as warehouse_name
      FROM fabrication_orders fo
      JOIN items i ON fo.finished_item_id = i.id
      JOIN bom b ON fo.bom_id = b.id
      JOIN warehouses w ON fo.warehouse_id = w.id
      WHERE fo.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!order) return null

    const materials = getDb().prepare(`
      SELECT fom.*, i.name as raw_material_name, i.item_code as raw_material_code, u.short_code as unit_short_code,
        COALESCE((SELECT quantity_on_hand FROM item_stock WHERE item_id = fom.raw_material_item_id AND warehouse_id = ? LIMIT 1), 0) as current_stock
      FROM fabrication_order_materials fom
      JOIN items i ON fom.raw_material_item_id = i.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE fom.fabrication_order_id = ?
    `).all(order.warehouse_id, id)

    return { ...order, materials }
  })

  ipcMain.handle('fab:start', async (_event, userId: number, id: number, overrideLowStock?: boolean) => {
    assertUser(userId)
    return runTransaction(() => {
      const order = getDb().prepare('SELECT * FROM fabrication_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!order) throw new Error('Fabrication order not found')
      if (order.status !== 'planned') throw new Error('Only planned orders can be started')

      const materials = getDb().prepare(
        'SELECT fom.*, COALESCE((SELECT quantity_on_hand FROM item_stock WHERE item_id = fom.raw_material_item_id AND warehouse_id = ?), 0) as current_stock FROM fabrication_order_materials fom WHERE fom.fabrication_order_id = ?'
      ).all(order.warehouse_id, id) as Array<{
        id: number; raw_material_item_id: number; quantity_consumed: number; unit_cost: number; current_stock: number
      }>

      if (!overrideLowStock) {
        const insufficient = materials.filter((m) => m.current_stock < m.quantity_consumed)
        if (insufficient.length > 0) {
          const details = insufficient.map((m) => `item #${m.raw_material_item_id}: need ${m.quantity_consumed}, have ${m.current_stock}`)
          return { error: 'insufficient_stock', details }
        }
      }

      // Issue raw materials from warehouse
      const warehouseId = order.warehouse_id as number
      for (const m of materials) {
        recordStockMovement(
          m.raw_material_item_id, warehouseId, 'fabrication_out',
          m.quantity_consumed, m.unit_cost, 'fabrication_order', id,
          new Date().toISOString().split('T')[0],
          `Fab order #${order.fab_order_number}`, userId
        )
      }

      getDb().prepare('UPDATE fabrication_orders SET status = ?, date_started = ? WHERE id = ?').run('in_progress', new Date().toISOString().split('T')[0], id)
      logActivity(userId, 'update', 'fabrication', id, `Started fab order #${id}`)
      return { success: true }
    })
  })

  ipcMain.handle('fab:complete', async (_event, userId: number, id: number, data: {
    quantity_produced: number
    actual_labor_cost?: number; actual_overhead_cost?: number
    materials?: Array<{ id: number; quantity_consumed: number }>
  }) => {
    assertUser(userId)
    return runTransaction(() => {
      const order = getDb().prepare('SELECT * FROM fabrication_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!order) throw new Error('Fabrication order not found')
      if (order.status !== 'in_progress' && order.status !== 'planned') throw new Error('Order must be planned or in-progress to complete')
      if (data.quantity_produced <= 0) throw new Error('Quantity produced must be greater than zero')

      // Update material consumption if provided
      if (data.materials) {
        for (const m of data.materials) {
          getDb().prepare('UPDATE fabrication_order_materials SET quantity_consumed = ? WHERE id = ? AND fabrication_order_id = ?').run(m.quantity_consumed, m.id, id)
        }
      }

      // Recalculate material costs using current avg cost
      const materials = getDb().prepare(`
        SELECT fom.*, COALESCE((SELECT average_cost FROM item_stock WHERE item_id = fom.raw_material_item_id LIMIT 1), 0) as current_avg_cost
        FROM fabrication_order_materials fom WHERE fom.fabrication_order_id = ?
      `).all(id) as Array<{
        id: number; raw_material_item_id: number; quantity_consumed: number; unit_cost: number; total_cost: number; current_avg_cost: number
      }>

      // If materials were already issued (in_progress), unit_cost is already set at issue time
      // If we're completing from planned (no issue), we need to do the issue step
      const warehouseId = order.warehouse_id as number
      let totalMaterialCost = 0

      for (const m of materials) {
        const unitCost = m.unit_cost > 0 ? m.unit_cost : m.current_avg_cost
        const totalCost = round2(m.quantity_consumed * unitCost)
        totalMaterialCost += totalCost
        getDb().prepare('UPDATE fabrication_order_materials SET unit_cost = ?, total_cost = ? WHERE id = ?').run(unitCost, totalCost, m.id)

        // If still planned, issue materials now
        if (order.status === 'planned') {
          recordStockMovement(
            m.raw_material_item_id, warehouseId, 'fabrication_out',
            m.quantity_consumed, unitCost, 'fabrication_order', id,
            new Date().toISOString().split('T')[0],
            `Fab order #${order.fab_order_number}`, userId
          )
        }
      }

      const laborCost = data.actual_labor_cost ?? 0
      const overheadCost = data.actual_overhead_cost ?? 0
      const totalFabCost = round2(totalMaterialCost + laborCost + overheadCost)
      const costPerUnit = round2(totalFabCost / data.quantity_produced)

      // Produce finished goods
      recordStockMovement(
        order.finished_item_id as number, warehouseId, 'fabrication_in',
        data.quantity_produced, costPerUnit, 'fabrication_order', id,
        new Date().toISOString().split('T')[0],
        `Fab order #${order.fab_order_number} completion`, userId
      )

      // Update order
      getDb().prepare(`
        UPDATE fabrication_orders SET status = 'completed', quantity_produced = ?, date_completed = ?,
          actual_labor_cost = ?, actual_overhead_cost = ?, total_material_cost = ?, total_fabrication_cost = ?, cost_per_unit = ?
        WHERE id = ?
      `).run(data.quantity_produced, new Date().toISOString().split('T')[0], laborCost, overheadCost, totalMaterialCost, totalFabCost, costPerUnit, id)

      // Journal entry
      const fgInvId = getCoaId('1400')  // Inventory - Finished Goods
      const rmInvId = getCoaId('1300')  // Inventory - Raw Material
      const fabClearingId = getCoaId('5100')  // Fabrication Cost (clearing)

      const jeResult = getDb().prepare(`
        INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, description, created_by)
        VALUES (?, ?, 'fabrication_order', ?, ?, ?)
      `).run(
        `JE-FAB-${id}`, new Date().toISOString().split('T')[0], id,
        `Fab order #${order.fab_order_number} completed`, userId
      )
      const jeId = Number(jeResult.lastInsertRowid)
      const jeLine = getDb().prepare(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
      )
      // Dr Finished Goods Inventory (total cost)
      jeLine.run(jeId, fgInvId, totalFabCost, 0, `FG produced - ${order.fab_order_number}`)
      // Cr Raw Material Inventory (material cost)
      jeLine.run(jeId, rmInvId, 0, totalMaterialCost, `RM consumed - ${order.fab_order_number}`)
      // Cr Fabrication Cost Clearing for labor + overhead
      const laborOverhead = round2(laborCost + overheadCost)
      if (laborOverhead > 0) {
        jeLine.run(jeId, fabClearingId, 0, laborOverhead, `Labor & overhead - ${order.fab_order_number}`)
      }

      logActivity(userId, 'update', 'fabrication', id, `Completed fab order #${id}, produced ${data.quantity_produced}`)
      return { total_fabrication_cost: totalFabCost, cost_per_unit: costPerUnit }
    })
  })

  ipcMain.handle('fab:cancel', async (_event, userId: number, id: number) => {
    assertUser(userId)
    return runTransaction(() => {
      const order = getDb().prepare('SELECT * FROM fabrication_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!order) throw new Error('Fabrication order not found')
      if (order.status === 'completed') throw new Error('Cannot cancel completed orders')
      if (order.status === 'cancelled') throw new Error('Order already cancelled')

      // If in_progress, reverse material issuance
      if (order.status === 'in_progress') {
        const materials = getDb().prepare(
          'SELECT * FROM fabrication_order_materials WHERE fabrication_order_id = ?'
        ).all(id) as Array<{ raw_material_item_id: number; quantity_consumed: number; unit_cost: number }>

        const warehouseId = order.warehouse_id as number
        for (const m of materials) {
          recordStockMovement(
            m.raw_material_item_id, warehouseId, 'adjustment_in',
            m.quantity_consumed, m.unit_cost, 'fabrication_order_cancel', id,
            new Date().toISOString().split('T')[0],
            `Cancel fab order #${order.fab_order_number} - return materials`, userId
          )
        }
      }

      getDb().prepare('UPDATE fabrication_orders SET status = ? WHERE id = ?').run('cancelled', id)
      logActivity(userId, 'update', 'fabrication', id, `Cancelled fab order #${id}`)
      return true
    })
  })
}

export function registerFabricationHandlers() {
  registerBOMHandlers()
  registerFabricationOrderHandlers()
}
