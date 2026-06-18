import { ipcMain } from 'electron'
import { getDb, logActivity } from '../database/db.js'

function assertUser(userId: number) {
  const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: number } | undefined
  if (!user) throw new Error('Invalid user')
}

const ITEM_TYPE_PREFIXES: Record<string, string> = {
  raw_material: 'RM',
  finished_good: 'FG',
  fabricated: 'FB',
}

function generateItemCode(itemType: string): string {
  const prefix = ITEM_TYPE_PREFIXES[itemType] ?? 'IT'
  const last = getDb()
    .prepare(
      `SELECT item_code FROM items WHERE item_code LIKE ? ORDER BY id DESC LIMIT 1`
    )
    .get(`${prefix}-%`) as { item_code: string } | undefined
  const seq = last ? parseInt(last.item_code.split('-')[1], 10) + 1 : 1
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

// Shared internal function — all modules (purchases, fabrication, projects) will call this
export function recordStockMovement(
  itemId: number,
  warehouseId: number,
  movementType: string,
  quantity: number,
  unitCost: number,
  referenceType: string | null,
  referenceId: number | null,
  date: string,
  notes: string | null,
  userId: number
): void {
  const db = getDb()
  const totalValue = quantity * unitCost

  db.prepare(
    `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, unit_cost, total_value, reference_type, reference_id, date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, warehouseId, movementType, quantity, unitCost, totalValue, referenceType, referenceId, date, notes, userId)

  const existing = db
    .prepare('SELECT id, quantity_on_hand, average_cost FROM item_stock WHERE item_id = ? AND warehouse_id = ?')
    .get(itemId, warehouseId) as { id: number; quantity_on_hand: number; average_cost: number } | undefined

  if (movementType.endsWith('_in')) {
    if (existing) {
      const oldQty = existing.quantity_on_hand
      const oldCost = existing.average_cost
      const newQty = oldQty + quantity
      // Weighted average cost
      const newAvgCost = newQty > 0 ? ((oldQty * oldCost) + (quantity * unitCost)) / newQty : unitCost
      db.prepare(
        'UPDATE item_stock SET quantity_on_hand = quantity_on_hand + ?, average_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(quantity, newAvgCost, existing.id)
    } else {
      db.prepare(
        'INSERT INTO item_stock (item_id, warehouse_id, quantity_on_hand, average_cost) VALUES (?, ?, ?, ?)'
      ).run(itemId, warehouseId, quantity, unitCost)
    }
  } else if (movementType.endsWith('_out')) {
    if (!existing) throw new Error('No stock record found for this item in the selected warehouse')
    db.prepare(
      'UPDATE item_stock SET quantity_on_hand = quantity_on_hand - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(quantity, existing.id)
  }
}

// =====================================================================
// UNITS
// =====================================================================
function registerUnitHandlers() {
  ipcMain.handle('inventory:listUnits', async () => {
    return getDb().prepare('SELECT * FROM units ORDER BY name').all()
  })

  ipcMain.handle('inventory:createUnit', async (_event, userId: number, data: { name: string; short_code: string }) => {
    assertUser(userId)
    const { name, short_code } = data
    if (!name || !short_code) throw new Error('Name and short code are required')
    try {
      const result = getDb().prepare('INSERT INTO units (name, short_code) VALUES (?, ?)').run(name, short_code)
      logActivity(userId, 'create', 'inventory', result.lastInsertRowid as number, `Created unit ${name}`)
      return { id: result.lastInsertRowid }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('A unit with this short code already exists')
      throw err
    }
  })

  ipcMain.handle('inventory:updateUnit', async (_event, userId: number, id: number, data: { name?: string; short_code?: string }) => {
    assertUser(userId)
    const updates: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name) }
    if (data.short_code !== undefined) { updates.push('short_code = ?'); values.push(data.short_code) }
    if (updates.length === 0) throw new Error('No fields to update')
    values.push(id)
    try {
      getDb().prepare(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`).run(...values)
      logActivity(userId, 'update', 'inventory', id, `Updated unit #${id}`)
      return true
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('A unit with this short code already exists')
      throw err
    }
  })

  ipcMain.handle('inventory:deleteUnit', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const used = getDb().prepare('SELECT COUNT(*) as c FROM items WHERE unit_id = ?').get(id) as { c: number }
    if (used.c > 0) throw new Error('Cannot delete: unit is in use by one or more items')
    getDb().prepare('DELETE FROM units WHERE id = ?').run(id)
    logActivity(userId, 'delete', 'inventory', id, `Deleted unit #${id}`)
    return true
  })
}

// =====================================================================
// CATEGORIES
// =====================================================================
function registerCategoryHandlers() {
  ipcMain.handle('inventory:listCategories', async () => {
    return getDb().prepare('SELECT * FROM item_categories ORDER BY name').all()
  })

  ipcMain.handle('inventory:createCategory', async (_event, userId: number, data: { name: string; parent_id?: number | null; item_type?: string | null }) => {
    assertUser(userId)
    const { name, parent_id, item_type } = data
    if (!name) throw new Error('Category name is required')
    const result = getDb().prepare('INSERT INTO item_categories (name, parent_id, item_type) VALUES (?, ?, ?)').run(name, parent_id ?? null, item_type ?? null)
    logActivity(userId, 'create', 'inventory', result.lastInsertRowid as number, `Created category ${name}`)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('inventory:updateCategory', async (_event, userId: number, id: number, data: { name?: string; parent_id?: number | null; item_type?: string | null }) => {
    assertUser(userId)
    const updates: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name) }
    if (data.parent_id !== undefined) { updates.push('parent_id = ?'); values.push(data.parent_id) }
    if (data.item_type !== undefined) { updates.push('item_type = ?'); values.push(data.item_type) }
    if (updates.length === 0) throw new Error('No fields to update')
    values.push(id)
    getDb().prepare(`UPDATE item_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    logActivity(userId, 'update', 'inventory', id, `Updated category #${id}`)
    return true
  })

  ipcMain.handle('inventory:deleteCategory', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const children = getDb().prepare('SELECT COUNT(*) as c FROM item_categories WHERE parent_id = ?').get(id) as { c: number }
    if (children.c > 0) throw new Error('Cannot delete: category has subcategories')
    const used = getDb().prepare('SELECT COUNT(*) as c FROM items WHERE category_id = ?').get(id) as { c: number }
    if (used.c > 0) throw new Error('Cannot delete: category is in use by one or more items')
    getDb().prepare('DELETE FROM item_categories WHERE id = ?').run(id)
    logActivity(userId, 'delete', 'inventory', id, `Deleted category #${id}`)
    return true
  })
}

// =====================================================================
// WAREHOUSES
// =====================================================================
function registerWarehouseHandlers() {
  ipcMain.handle('inventory:listWarehouses', async () => {
    return getDb().prepare('SELECT * FROM warehouses ORDER BY name').all()
  })

  ipcMain.handle('inventory:createWarehouse', async (_event, userId: number, data: { name: string; location?: string }) => {
    assertUser(userId)
    const { name, location } = data
    if (!name) throw new Error('Warehouse name is required')
    const result = getDb().prepare('INSERT INTO warehouses (name, location) VALUES (?, ?)').run(name, location ?? null)
    logActivity(userId, 'create', 'inventory', result.lastInsertRowid as number, `Created warehouse ${name}`)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('inventory:updateWarehouse', async (_event, userId: number, id: number, data: { name?: string; location?: string }) => {
    assertUser(userId)
    const updates: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name) }
    if (data.location !== undefined) { updates.push('location = ?'); values.push(data.location) }
    if (updates.length === 0) throw new Error('No fields to update')
    values.push(id)
    getDb().prepare(`UPDATE warehouses SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    logActivity(userId, 'update', 'inventory', id, `Updated warehouse #${id}`)
    return true
  })

  ipcMain.handle('inventory:toggleWarehouse', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const current = getDb().prepare('SELECT is_active FROM warehouses WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!current) throw new Error('Warehouse not found')
    const newStatus = current.is_active ? 0 : 1
    getDb().prepare('UPDATE warehouses SET is_active = ? WHERE id = ?').run(newStatus, id)
    logActivity(userId, 'update', 'inventory', id, `${newStatus ? 'Activated' : 'Deactivated'} warehouse #${id}`)
    return { is_active: newStatus }
  })
}

// =====================================================================
// ITEMS
// =====================================================================
function registerItemHandlers() {
  ipcMain.handle('inventory:listItems', async (_event, userId: number, filters?: {
    item_type?: string
    category_id?: number
    search?: string
    low_stock_only?: boolean
    is_active?: boolean | null
  }) => {
    assertUser(userId)
    const where: string[] = []
    const values: unknown[] = []

    if (filters?.item_type) {
      where.push('i.item_type = ?')
      values.push(filters.item_type)
    }
    if (filters?.category_id) {
      where.push('i.category_id = ?')
      values.push(filters.category_id)
    }
    if (filters?.search) {
      where.push('(i.name LIKE ? OR i.item_code LIKE ?)')
      const s = `%${filters.search}%`
      values.push(s, s)
    }
    if (filters?.is_active !== null && filters?.is_active !== undefined) {
      where.push('i.is_active = ?')
      values.push(filters.is_active ? 1 : 0)
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

    const items = getDb()
      .prepare(`
        SELECT i.*, u.name as unit_name, u.short_code as unit_short_code,
               c.name as category_name
        FROM items i
        LEFT JOIN units u ON i.unit_id = u.id
        LEFT JOIN item_categories c ON i.category_id = c.id
        ${whereClause}
        ORDER BY i.item_code
      `)
      .all(...values) as Array<Record<string, unknown>>

    // Attach total stock
    const itemIds = items.map((item) => item.id)
    if (itemIds.length === 0) return items

    const placeholders = itemIds.map(() => '?').join(',')
    const stocks = getDb()
      .prepare(`SELECT item_id, SUM(quantity_on_hand) as total_stock FROM item_stock WHERE item_id IN (${placeholders}) GROUP BY item_id`)
      .all(...itemIds) as Array<{ item_id: number; total_stock: number }>

    const stockMap = new Map(stocks.map((s) => [s.item_id, s.total_stock]))

    let result = items.map((item) => ({
      ...item,
      current_stock: stockMap.get(item.id as number) ?? 0,
    }))

    if (filters?.low_stock_only) {
      result = result.filter((item: any) => (item.current_stock as number) < (item.reorder_level as number))
    }

    return result
  })

  ipcMain.handle('inventory:getItem', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const item = getDb()
      .prepare(`
        SELECT i.*, u.name as unit_name, u.short_code as unit_short_code,
               c.name as category_name
        FROM items i
        LEFT JOIN units u ON i.unit_id = u.id
        LEFT JOIN item_categories c ON i.category_id = c.id
        WHERE i.id = ?
      `)
      .get(id) as Record<string, unknown> | undefined
    if (!item) return null
    return item
  })

  ipcMain.handle('inventory:createItem', async (_event, userId: number, data: {
    name: string
    category_id?: number
    item_type: string
    unit_id?: number
    reorder_level?: number
    standard_cost?: number
    standard_sale_price?: number
    hsn_code?: string
    description?: string
  }) => {
    assertUser(userId)
    if (!data.name) throw new Error('Item name is required')
    const itemCode = generateItemCode(data.item_type)
    const result = getDb()
      .prepare(
        `INSERT INTO items (item_code, name, category_id, item_type, unit_id, reorder_level, standard_cost, standard_sale_price, hsn_code, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        itemCode,
        data.name,
        data.category_id ?? null,
        data.item_type,
        data.unit_id ?? null,
        data.reorder_level ?? 0,
        data.standard_cost ?? 0,
        data.standard_sale_price ?? 0,
        data.hsn_code ?? null,
        data.description ?? null
      )
    logActivity(userId, 'create', 'inventory', result.lastInsertRowid as number, `Created item ${itemCode} - ${data.name}`)
    return { id: result.lastInsertRowid, item_code: itemCode }
  })

  ipcMain.handle('inventory:updateItem', async (_event, userId: number, id: number, data: {
    name?: string
    category_id?: number
    item_type?: string
    unit_id?: number
    reorder_level?: number
    standard_cost?: number
    standard_sale_price?: number
    hsn_code?: string
    description?: string
  }) => {
    assertUser(userId)
    const updates: string[] = []
    const values: unknown[] = []

    const fields = ['name', 'category_id', 'item_type', 'unit_id', 'reorder_level', 'standard_cost', 'standard_sale_price', 'hsn_code', 'description'] as const
    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(data[field] ?? null)
      }
    }
    if (updates.length === 0) throw new Error('No fields to update')
    values.push(id)
    getDb().prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    logActivity(userId, 'update', 'inventory', id, `Updated item #${id}`)
    return true
  })

  ipcMain.handle('inventory:toggleItem', async (_event, userId: number, id: number) => {
    assertUser(userId)
    const current = getDb().prepare('SELECT is_active FROM items WHERE id = ?').get(id) as { is_active: number } | undefined
    if (!current) throw new Error('Item not found')
    const newStatus = current.is_active ? 0 : 1
    getDb().prepare('UPDATE items SET is_active = ? WHERE id = ?').run(newStatus, id)
    logActivity(userId, 'update', 'inventory', id, `${newStatus ? 'Activated' : 'Deactivated'} item #${id}`)
    return { is_active: newStatus }
  })
}

// =====================================================================
// STOCK
// =====================================================================
function registerStockHandlers() {
  ipcMain.handle('inventory:getItemStock', async (_event, userId: number, itemId: number) => {
    assertUser(userId)
    const perWarehouse = getDb()
      .prepare(`
        SELECT is2.*, w.name as warehouse_name
        FROM item_stock is2
        JOIN warehouses w ON is2.warehouse_id = w.id
        WHERE is2.item_id = ?
        ORDER BY w.name
      `)
      .all(itemId)

    const total = (perWarehouse as Array<{ quantity_on_hand: number }>).reduce((sum, r) => sum + r.quantity_on_hand, 0)

    return { per_warehouse: perWarehouse, total }
  })

  ipcMain.handle('inventory:getAllStockLevels', async (_event, userId: number, filters?: {
    item_type?: string
    warehouse_id?: number
    below_reorder_only?: boolean
  }) => {
    assertUser(userId)
    const where: string[] = []
    const values: unknown[] = []

    if (filters?.item_type) {
      where.push('i.item_type = ?')
      values.push(filters.item_type)
    }
    if (filters?.warehouse_id) {
      where.push('is2.warehouse_id = ?')
      values.push(filters.warehouse_id)
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

    const rows = getDb()
      .prepare(`
        SELECT i.id, i.item_code, i.name, i.item_type, i.reorder_level, i.standard_cost, i.average_cost as avg_cost,
               i.unit_id, u.name as unit_name, u.short_code as unit_short_code,
               w.id as warehouse_id, w.name as warehouse_name,
               is2.quantity_on_hand, is2.average_cost
        FROM item_stock is2
        JOIN items i ON is2.item_id = i.id
        JOIN warehouses w ON is2.warehouse_id = w.id
        LEFT JOIN units u ON i.unit_id = u.id
        ${whereClause}
        ORDER BY i.item_code, w.name
      `)
      .all(...values) as Array<Record<string, unknown>>

    if (filters?.below_reorder_only) {
      return (rows as Array<{ quantity_on_hand: number; reorder_level: number }>).filter((r) => r.quantity_on_hand < r.reorder_level)
    }

    return rows
  })

  ipcMain.handle('inventory:getItemStockHistory', async (_event, userId: number, itemId: number, filters?: {
    warehouse_id?: number
    date_from?: string
    date_to?: string
  }) => {
    assertUser(userId)
    const where: string[] = ['sm.item_id = ?']
    const values: unknown[] = [itemId]

    if (filters?.warehouse_id) {
      where.push('sm.warehouse_id = ?')
      values.push(filters.warehouse_id)
    }
    if (filters?.date_from) {
      where.push('sm.date >= ?')
      values.push(filters.date_from)
    }
    if (filters?.date_to) {
      where.push('sm.date <= ?')
      values.push(filters.date_to)
    }

    const movements = getDb()
      .prepare(`
        SELECT sm.*, w.name as warehouse_name, u.full_name as created_by_name
        FROM stock_movements sm
        JOIN warehouses w ON sm.warehouse_id = w.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE ${where.join(' AND ')}
        ORDER BY sm.date ASC, sm.created_at ASC
      `)
      .all(...values) as Array<Record<string, unknown>>

    // Calculate running balance
    let runningQty = 0
    return movements.map((m) => {
      const qty = m.quantity as number
      const isIn = (m.movement_type as string).endsWith('_in')
      runningQty += isIn ? qty : -qty
      return { ...m, running_balance: runningQty }
    })
  })

  ipcMain.handle('inventory:adjustStock', async (_event, userId: number, data: {
    item_id: number
    warehouse_id: number
    quantity: number
    type: 'adjustment_in' | 'adjustment_out'
    reason?: string
    date: string
  }) => {
    assertUser(userId)
    const { item_id, warehouse_id, quantity, type, reason, date } = data
    if (quantity <= 0) throw new Error('Quantity must be greater than zero')
    if (!date) throw new Error('Date is required')

    // Get current average cost for valuation
    const stock = getDb()
      .prepare('SELECT quantity_on_hand, average_cost FROM item_stock WHERE item_id = ? AND warehouse_id = ?')
      .get(item_id, warehouse_id) as { quantity_on_hand: number; average_cost: number } | undefined

    const unitCost = stock?.average_cost ?? 0

    recordStockMovement(
      item_id,
      warehouse_id,
      type,
      quantity,
      type === 'adjustment_in' ? unitCost : unitCost,
      null,
      null,
      date,
      reason ?? null,
      userId
    )

    logActivity(userId, 'create', 'inventory', item_id, `Stock ${type === 'adjustment_in' ? 'increase' : 'decrease'} for item #${item_id}, qty: ${quantity}, reason: ${reason ?? 'N/A'}`)
    return true
  })

  ipcMain.handle('inventory:getLowStockItems', async () => {
    return getDb()
      .prepare(`
        SELECT i.id, i.item_code, i.name, i.item_type, i.reorder_level, i.is_active,
               u.name as unit_name, u.short_code as unit_short_code,
               COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) as current_stock
        FROM items i
        LEFT JOIN units u ON i.unit_id = u.id
        WHERE i.is_active = 1
          AND i.reorder_level > 0
          AND COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) < i.reorder_level
        ORDER BY (COALESCE((SELECT SUM(quantity_on_hand) FROM item_stock WHERE item_id = i.id), 0) * 1.0 / i.reorder_level) ASC
      `)
      .all()
  })

  ipcMain.handle('inventory:listAllStockMovements', async (_event, userId: number, filters?: {
    item_id?: number
    warehouse_id?: number
    movement_type?: string
    date_from?: string
    date_to?: string
    reference_type?: string
  }) => {
    assertUser(userId)
    const where: string[] = []
    const values: unknown[] = []

    if (filters?.item_id) { where.push('sm.item_id = ?'); values.push(filters.item_id) }
    if (filters?.warehouse_id) { where.push('sm.warehouse_id = ?'); values.push(filters.warehouse_id) }
    if (filters?.movement_type) { where.push('sm.movement_type = ?'); values.push(filters.movement_type) }
    if (filters?.date_from) { where.push('sm.date >= ?'); values.push(filters.date_from) }
    if (filters?.date_to) { where.push('sm.date <= ?'); values.push(filters.date_to) }
    if (filters?.reference_type) { where.push('sm.reference_type = ?'); values.push(filters.reference_type) }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

    return getDb()
      .prepare(`
        SELECT sm.*, i.item_code, i.name as item_name, w.name as warehouse_name,
               u.full_name as created_by_name
        FROM stock_movements sm
        JOIN items i ON sm.item_id = i.id
        JOIN warehouses w ON sm.warehouse_id = w.id
        LEFT JOIN users u ON sm.created_by = u.id
        ${whereClause}
        ORDER BY sm.date DESC, sm.created_at DESC
      `)
      .all(...values)
  })
}

export function registerInventoryHandlers() {
  registerUnitHandlers()
  registerCategoryHandlers()
  registerWarehouseHandlers()
  registerItemHandlers()
  registerStockHandlers()
}
