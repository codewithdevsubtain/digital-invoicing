import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, X, Pencil, Power, PowerOff, PackageOpen } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import Loading from '../../components/Loading.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { ItemWithStock, ItemDetail, Unit, ItemCategory, Warehouse, StockPerWarehouse, StockMovementWithBalance } from '../../lib/types.js'

const emptyForm = { name: '', category_id: '' as string | number, unit_id: '' as string | number, reorder_level: '', standard_cost: '', standard_sale_price: '', hsn_code: '', description: '', item_type: 'finished_good' as 'finished_good' | 'fabricated' }

export default function FinishedGoods() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [items, setItems] = useState<ItemWithStock[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ItemWithStock | null>(null)
  const [toggling, setToggling] = useState<ItemWithStock | null>(null)
  const [form, setForm] = useState(emptyForm)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [stockByWarehouse, setStockByWarehouse] = useState<StockPerWarehouse[]>([])
  const [totalStock, setTotalStock] = useState(0)
  const [stockHistory, setStockHistory] = useState<StockMovementWithBalance[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [showAdjust, setShowAdjust] = useState(false)
  const [adjForm, setAdjForm] = useState({ warehouse_id: '' as string | number, type: 'adjustment_in' as 'adjustment_in' | 'adjustment_out', quantity: '', reason: '', date: new Date().toISOString().split('T')[0] })

  const [units, setUnits] = useState<Unit[]>([])
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const loadReference = useCallback(async () => {
    try {
      const [u, c, w] = await Promise.all([
        api.inventory.listUnits(),
        api.inventory.listCategories(),
        api.inventory.listWarehouses(),
      ])
      setUnits(u)
      setCategories(c.filter((cat) => !cat.item_type || cat.item_type === 'finished_good' || cat.item_type === 'fabricated'))
      setWarehouses(w.filter((wh) => wh.is_active))
    } catch { /* ignore */ }
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const all: ItemWithStock[] = []
      if (typeFilter === 'all' || typeFilter === 'finished_good') {
        const fg = await api.inventory.listItems(user.id, { item_type: 'finished_good', search: search || undefined })
        all.push(...fg)
      }
      if (typeFilter === 'all' || typeFilter === 'fabricated') {
        const fb = await api.inventory.listItems(user.id, { item_type: 'fabricated', search: search || undefined })
        all.push(...fb)
      }
      setItems(all)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load finished goods' })
    } finally { setLoading(false) }
  }, [user, search, typeFilter, addToast])

  useEffect(() => { load(); loadReference() }, [load, loadReference])

  const openDetail = async (id: number) => {
    if (!user) return
    setSelectedId(id)
    setDetailLoading(true)
    try {
      const [d, s, h] = await Promise.all([
        api.inventory.getItem(user.id, id),
        api.inventory.getItemStock(user.id, id),
        api.inventory.getItemStockHistory(user.id, id),
      ])
      setDetail(d)
      setStockByWarehouse(s.per_warehouse)
      setTotalStock(s.total)
      setStockHistory(h)
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load item details' })
    } finally { setDetailLoading(false) }
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (item: ItemWithStock) => {
    setEditing(item)
    setForm({
      name: item.name,
      category_id: item.category_id ?? '',
      unit_id: item.unit_id ?? '',
      reorder_level: String(item.reorder_level || ''),
      standard_cost: String(item.standard_cost || ''),
      standard_sale_price: String((item as any).standard_sale_price ?? ''),
      hsn_code: item.hsn_code ?? '',
      description: item.description ?? '',
      item_type: (item.item_type as 'finished_good' | 'fabricated') || 'finished_good',
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!form.name) { addToast({ type: 'warning', title: 'Validation', message: 'Name is required' }); return }
    try {
      const data = {
        name: form.name,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        item_type: form.item_type,
        unit_id: form.unit_id ? Number(form.unit_id) : undefined,
        reorder_level: Number(form.reorder_level) || 0,
        standard_cost: Number(form.standard_cost) || 0,
        standard_sale_price: Number(form.standard_sale_price) || 0,
        hsn_code: form.hsn_code || undefined,
        description: form.description || undefined,
      }
      if (editing) {
        await api.inventory.updateItem(user.id, editing.id, data)
        addToast({ type: 'success', title: 'Updated', message: 'Item updated' })
      } else {
        await api.inventory.createItem(user.id, data)
        addToast({ type: 'success', title: 'Created', message: 'Item created' })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleToggle = async () => {
    if (!user || !toggling) return
    try {
      await api.inventory.toggleItem(user.id, toggling.id)
      addToast({ type: 'success', title: 'Updated', message: `Item ${toggling.is_active ? 'deactivated' : 'activated'}` })
      setToggling(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleAdjust = async () => {
    if (!user || !selectedId) return
    if (!adjForm.warehouse_id || !adjForm.quantity || !adjForm.date) {
      addToast({ type: 'warning', title: 'Validation', message: 'Warehouse, quantity, and date are required' })
      return
    }
    try {
      await api.inventory.adjustStock(user.id, {
        item_id: selectedId,
        warehouse_id: Number(adjForm.warehouse_id),
        quantity: Number(adjForm.quantity),
        type: adjForm.type,
        reason: adjForm.reason || undefined,
        date: adjForm.date,
      })
      addToast({ type: 'success', title: 'Adjusted', message: 'Stock adjusted' })
      setShowAdjust(false)
      setAdjForm({ warehouse_id: '', type: 'adjustment_in', quantity: '', reason: '', date: new Date().toISOString().split('T')[0] })
      if (selectedId) openDetail(selectedId)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const unitOptions = units.map((u) => ({ value: u.id, label: `${u.name} (${u.short_code})` }))
  const catOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }))

  const isLowStock = (item: ItemWithStock) => (item.current_stock ?? 0) < item.reorder_level && item.reorder_level > 0

  return (
    <div>
      <PageHeader title="Finished Goods" subtitle="Manage finished goods, fabricated items, and stock">
        <button onClick={openAdd} className="btn-primary gap-2"><Plus size={18} /> Add Item</button>
      </PageHeader>

      <div className="mt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." className="input-field pl-9" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field w-44">
            <option value="all">All Types</option>
            <option value="finished_good">Finished Goods</option>
            <option value="fabricated">Fabricated</option>
          </select>
          <span className="text-sm text-gray-500">{items.length} item(s)</span>
        </div>

        <DataTable
          data={items}
          onRowClick={(row) => openDetail(row.id)}
          columns={[
            { key: 'item_code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.item_code ?? '-'}</span> },
            { key: 'name', header: 'Name' },
            { key: 'item_type', header: 'Type', render: (r) => <StatusBadge status={r.item_type === 'finished_good' ? 'Finished Good' : 'Fabricated'} /> },
            { key: 'category_name', header: 'Category', render: (r) => r.category_name ?? '-' },
            { key: 'unit_short_code', header: 'Unit', render: (r) => r.unit_short_code ?? '-' },
            { key: 'current_stock', header: 'Stock', render: (r) => {
              const low = isLowStock(r)
              return <span className={`font-medium ${low ? 'text-orange-600' : 'text-gray-900'}`}>{r.current_stock ?? 0} {r.unit_short_code ?? ''}</span>
            }},
            { key: 'standard_sale_price', header: 'Sale Price', render: (r) => formatCurrency((r as any).standard_sale_price ?? 0) },
            { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
            { key: 'id', header: 'Actions', render: (r) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEdit(r)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Pencil size={14} /></button>
                <button onClick={() => setToggling(r)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  {r.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                </button>
              </div>
            )},
          ]}
        />
      </div>

      {/* Add/Edit Modal */}
      <FormModal open={showModal} title={editing ? 'Edit Item' : 'Add Item'} onClose={() => setShowModal(false)} onSubmit={handleSubmit}>
        <div>
          <label className="label-text mb-1">Name *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Pre-fabricated Duct Section" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-text mb-1">Item Type</label>
            <select value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value as 'finished_good' | 'fabricated' })} className="input-field">
              <option value="finished_good">Finished Good (purchased ready-made)</option>
              <option value="fabricated">Fabricated (manufactured in-house)</option>
            </select>
          </div>
          <SearchableSelect label="Category" options={catOptions} value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v })} placeholder="Select category" />
        </div>
        <SearchableSelect label="Unit" options={unitOptions} value={form.unit_id} onChange={(v) => setForm({ ...form, unit_id: v })} placeholder="Select unit" />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label-text mb-1">Reorder Level</label>
            <input type="number" step="0.01" min="0" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="label-text mb-1">Unit Cost (PKR)</label>
            <input type="number" step="0.01" min="0" value={form.standard_cost} onChange={(e) => setForm({ ...form, standard_cost: e.target.value })} className="input-field" placeholder="0.00" />
          </div>
          <div>
            <label className="label-text mb-1">Sale Price (PKR)</label>
            <input type="number" step="0.01" min="0" value={form.standard_sale_price} onChange={(e) => setForm({ ...form, standard_sale_price: e.target.value })} className="input-field" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="label-text mb-1">HSN Code</label>
          <input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} className="input-field" placeholder="e.g., 8415.90" />
        </div>
        <div>
          <label className="label-text mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} placeholder="Optional notes" />
        </div>
      </FormModal>

      <ConfirmDialog open={!!toggling} title={toggling?.is_active ? 'Deactivate Item' : 'Activate Item'} message={`${toggling?.is_active ? 'Deactivate' : 'Activate'} "${toggling?.name}"?`} onConfirm={handleToggle} onCancel={() => setToggling(null)} confirmLabel={toggling?.is_active ? 'Deactivate' : 'Activate'} />

      {/* Detail drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="bg-black/30 flex-1" onClick={() => { setSelectedId(null); setDetail(null) }} />
          <div className="w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{detail?.item_code} - {detail?.name}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowAdjust(true); setAdjForm({ ...adjForm, date: new Date().toISOString().split('T')[0] }) }} className="btn-primary gap-2 !py-1.5 !px-3 text-sm"><PackageOpen size={14} /> Adjust Stock</button>
                <button onClick={() => { setSelectedId(null); setDetail(null) }} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={20} /></button>
              </div>
            </div>
            {detailLoading ? <Loading text="Loading details..." /> : (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Category:</span> <span className="font-medium">{detail?.category_name ?? '-'}</span></div>
                  <div><span className="text-gray-500">Unit:</span> <span className="font-medium">{detail?.unit_short_code ?? '-'}</span></div>
                  <div><span className="text-gray-500">Reorder Level:</span> <span className="font-medium">{detail?.reorder_level ?? 0}</span></div>
                  <div><span className="text-gray-500">Unit Cost:</span> <span className="font-medium">{formatCurrency(detail?.standard_cost ?? 0)}</span></div>
                  <div><span className="text-gray-500">Sale Price:</span> <span className="font-medium">{formatCurrency(detail?.standard_sale_price ?? 0)}</span></div>
                  <div><span className="text-gray-500">HSN Code:</span> <span className="font-medium">{detail?.hsn_code ?? '-'}</span></div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Stock per Warehouse (Total: {totalStock})</h4>
                  <table className="min-w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1 pr-4">Warehouse</th><th className="py-1 pr-4">Qty</th><th className="py-1">Avg Cost</th></tr></thead>
                    <tbody>
                      {stockByWarehouse.length === 0 ? (
                        <tr><td colSpan={3} className="py-4 text-center text-gray-400">No stock records</td></tr>
                      ) : stockByWarehouse.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium">{s.warehouse_name}</td>
                          <td className="py-2 pr-4">{s.quantity_on_hand}</td>
                          <td className="py-2">{formatCurrency(s.average_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Stock adjustment modal */}
                <FormModal open={showAdjust} title="Adjust Stock" onClose={() => setShowAdjust(false)} onSubmit={handleAdjust} submitLabel="Adjust">
                  <SearchableSelect label="Warehouse" options={warehouseOptions} value={adjForm.warehouse_id} onChange={(v) => setAdjForm({ ...adjForm, warehouse_id: v })} placeholder="Select warehouse" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label-text mb-1">Adjustment Type</label>
                      <select value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value as 'adjustment_in' | 'adjustment_out' })} className="input-field">
                        <option value="adjustment_in">Increase (+) / Stock In</option>
                        <option value="adjustment_out">Decrease (-) / Stock Out</option>
                      </select>
                    </div>
                    <div>
                      <label className="label-text mb-1">Quantity</label>
                      <input type="number" step="0.01" min="0" value={adjForm.quantity} onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })} className="input-field" placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label className="label-text mb-1">Date</label>
                    <input type="date" value={adjForm.date} onChange={(e) => setAdjForm({ ...adjForm, date: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className="label-text mb-1">Reason / Notes</label>
                    <textarea value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="input-field" rows={2} placeholder="e.g., Physical count adjustment" />
                  </div>
                </FormModal>

                {/* Stock movement history */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Stock Movement History</h4>
                  <table className="min-w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Warehouse</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">In</th><th className="py-1 pr-3">Out</th><th className="py-1 pr-3">Unit Cost</th><th className="py-1 pr-3">Balance</th><th className="py-1">Reference</th></tr></thead>
                    <tbody>
                      {stockHistory.length === 0 ? (
                        <tr><td colSpan={8} className="py-4 text-center text-gray-400">No movements recorded</td></tr>
                      ) : stockHistory.map((m) => {
                        const isIn = m.movement_type.endsWith('_in')
                        return (
                          <tr key={m.id} className="border-b border-gray-50">
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(m.date)}</td>
                            <td className="py-2 pr-3">{m.warehouse_name}</td>
                            <td className="py-2 pr-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isIn ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {m.movement_type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-green-600">{isIn ? m.quantity : '-'}</td>
                            <td className="py-2 pr-3 text-red-600">{!isIn ? m.quantity : '-'}</td>
                            <td className="py-2 pr-3">{formatCurrency(m.unit_cost)}</td>
                            <td className="py-2 pr-3 font-medium">{m.running_balance}</td>
                            <td className="py-2 text-xs text-gray-500">{m.reference_type ? `${m.reference_type} #${m.reference_id}` : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
