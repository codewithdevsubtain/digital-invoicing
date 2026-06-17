import { useEffect, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import type { StockMovementRow, Warehouse } from '../../lib/types.js'

export default function StockMovements() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [items, setItems] = useState<StockMovementRow[]>([])
  const [loading, setLoading] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [filters, setFilters] = useState({
    movement_type: '',
    warehouse_id: '' as string | number,
    date_from: '',
    date_to: '',
  })

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await api.inventory.listAllStockMovements(user.id, {
        ...(filters.movement_type ? { movement_type: filters.movement_type } : {}),
        ...(filters.warehouse_id ? { warehouse_id: Number(filters.warehouse_id) } : {}),
        ...(filters.date_from ? { date_from: filters.date_from } : {}),
        ...(filters.date_to ? { date_to: filters.date_to } : {}),
      })
      setItems(result)
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load stock movements' })
    } finally { setLoading(false) }
  }, [user, filters, addToast])

  useEffect(() => {
    load()
    api.inventory.listWarehouses().then((w) => setWarehouses(w)).catch(() => {})
  }, [load])

  const totalValue = items.reduce((sum, m) => sum + m.total_value, 0)
  const totalQty = items.reduce((sum, m) => sum + m.quantity, 0)

  return (
    <div>
      <PageHeader title="Stock Movements" subtitle="Global stock ledger — all movements across all items" />

      <div className="mt-6 space-y-4">
        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="label-text mb-1 text-xs">Movement Type</label>
              <select value={filters.movement_type} onChange={(e) => setFilters({ ...filters, movement_type: e.target.value })} className="input-field text-sm">
                <option value="">All Types</option>
                <option value="purchase_in">Purchase In</option>
                <option value="fabrication_in">Fabrication In</option>
                <option value="fabrication_out">Fabrication Out</option>
                <option value="project_issue">Project Issue</option>
                <option value="project_return">Project Return</option>
                <option value="adjustment_in">Adjustment In</option>
                <option value="adjustment_out">Adjustment Out</option>
                <option value="sale_out">Sale Out</option>
                <option value="opening_stock">Opening Stock</option>
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="label-text mb-1 text-xs">Warehouse</label>
              <select value={filters.warehouse_id} onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })} className="input-field text-sm">
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text mb-1 text-xs">From</label>
              <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="input-field text-sm" />
            </div>
            <div>
              <label className="label-text mb-1 text-xs">To</label>
              <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="input-field text-sm" />
            </div>
            <button onClick={load} className="btn-primary gap-2 !py-2 text-sm"><Search size={16} /> Filter</button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-3">
            <p className="text-xs text-gray-500">Total Movements</p>
            <p className="text-lg font-bold text-gray-900">{items.length}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-gray-500">Total Quantity</p>
            <p className="text-lg font-bold text-gray-900">{totalQty.toFixed(2)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalValue)}</p>
          </div>
        </div>

        {/* Table */}
        <DataTable
          data={items}
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
            { key: 'item_code', header: 'Item Code', render: (r) => <span className="font-mono text-xs">{r.item_code ?? '-'}</span> },
            { key: 'item_name', header: 'Item' },
            { key: 'warehouse_name', header: 'Warehouse' },
            { key: 'movement_type', header: 'Type', render: (r) => {
              const isIn = r.movement_type.endsWith('_in')
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isIn ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {r.movement_type.replace(/_/g, ' ')}
                </span>
              )
            }},
            { key: 'quantity', header: 'Qty', render: (r) => r.quantity.toFixed(2) },
            { key: 'unit_cost', header: 'Unit Cost', render: (r) => formatCurrency(r.unit_cost) },
            { key: 'total_value', header: 'Total', render: (r) => formatCurrency(r.total_value) },
            { key: 'reference_type', header: 'Reference', render: (r) => r.reference_type ? `${r.reference_type} #${r.reference_id}` : '-' },
            { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '-' },
          ]}
        />
      </div>
    </div>
  )
}
