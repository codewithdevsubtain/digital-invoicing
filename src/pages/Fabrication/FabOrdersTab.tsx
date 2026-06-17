import { useEffect, useState, useCallback } from 'react'
import { Plus, Play, CheckCircle, XCircle, Eye, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import type { FabricationOrderRow, BOMRow, Warehouse } from '../../lib/types.js'

const emptyForm = { bom_id: '' as string | number, quantity_to_produce: '1', warehouse_id: '' as string | number, date_started: new Date().toISOString().split('T')[0], notes: '' }

export default function FabOrdersTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)

  const [items, setItems] = useState<FabricationOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [boms, setBoms] = useState<Array<{ value: string | number; label: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ value: string | number; label: string }>>([])
  const [selectedBomDetail, setSelectedBomDetail] = useState<any>(null)

  // Detail view
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewData, setViewData] = useState<any>(null)

  // Start confirm
  const [starting, setStarting] = useState<FabricationOrderRow | null>(null)
  const [startOverride, setStartOverride] = useState(false)

  // Complete modal
  const [completingId, setCompletingId] = useState<number | null>(null)
  const [completeForm, setCompleteForm] = useState({
    quantity_produced: '0', actual_labor_cost: '0', actual_overhead_cost: '0'
  })
  const [materialOverrides, setMaterialOverrides] = useState<Record<number, string>>({})

  // Cancel confirm
  const [cancelling, setCancelling] = useState<FabricationOrderRow | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.fabrication.fab.list(user.id, {
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      setItems(list)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load orders' }) }
    finally { setLoading(false) }
  }, [user, statusFilter, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const [b, w] = await Promise.all([
        api.fabrication.bom.list(user.id),
        api.inventory.listWarehouses(),
      ])
      setBoms(b.filter((bom) => bom.is_active).map((bom) => ({ value: bom.id, label: `${bom.name} → ${bom.finished_item_name}` })))
      setWarehouses(w.filter((wh) => wh.is_active).map((wh) => ({ value: wh.id, label: wh.name })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])

  const onBomChange = async (bomId: string | number) => {
    if (!user || !bomId) { setSelectedBomDetail(null); return }
    try {
      const d = await api.fabrication.bom.getById(user.id, Number(bomId))
      setSelectedBomDetail(d)
    } catch { setSelectedBomDetail(null) }
  }

  const handleCreate = async () => {
    if (!user) return
    if (!form.bom_id || !form.warehouse_id) {
      addToast({ type: 'warning', title: 'Validation', message: 'BOM and warehouse are required' })
      return
    }
    try {
      const r = await api.fabrication.fab.create(user.id, {
        bom_id: Number(form.bom_id),
        quantity_to_produce: Number(form.quantity_to_produce) || 1,
        warehouse_id: Number(form.warehouse_id),
        date_started: form.date_started || undefined,
        notes: form.notes || undefined,
      })
      addToast({ type: 'success', title: 'Created', message: `Order ${r.fab_order_number} created` })
      setShowCreate(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const viewOrder = async (id: number) => {
    if (!user) return
    setViewId(id)
    try {
      const d = await api.fabrication.fab.getById(user.id, id)
      setViewData(d)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load order details' }) }
  }

  const handleStart = async () => {
    if (!user || !starting) return
    try {
      const r = await api.fabrication.fab.start(user.id, starting.id, startOverride)
      if (r.error === 'insufficient_stock') {
        addToast({ type: 'warning', title: 'Insufficient Stock', message: r.details?.join('; ') ?? 'Some materials are low. Override?' })
        // Show override option in the same dialog — toggle override and retry
        setStartOverride(true)
        return
      }
      addToast({ type: 'success', title: 'Started', message: 'Fabrication order is now in progress' })
      setStarting(null); setStartOverride(false); load(); if (viewId) viewOrder(viewId)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const openComplete = async (id: number) => {
    if (!user) return
    setCompletingId(id)
    try {
      const d = await api.fabrication.fab.getById(user.id, id)
      setCompleteForm({
        quantity_produced: String(d.quantity_to_produce),
        actual_labor_cost: String(d.actual_labor_cost || '0'),
        actual_overhead_cost: String(d.actual_overhead_cost || '0'),
      })
      const overrides: Record<number, string> = {}
      d.materials.forEach((m) => { overrides[m.id] = String(m.quantity_consumed) })
      setMaterialOverrides(overrides)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load order' }) }
  }

  const handleComplete = async () => {
    if (!user || !completingId) return
    const qty = Number(completeForm.quantity_produced)
    if (!qty || qty <= 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Quantity produced must be > 0' })
      return
    }
    try {
      const mats = Object.entries(materialOverrides).map(([id, qtyC]) => ({
        id: Number(id), quantity_consumed: Number(qtyC) || 0,
      }))
      const r = await api.fabrication.fab.complete(user.id, completingId, {
        quantity_produced: qty,
        actual_labor_cost: Number(completeForm.actual_labor_cost) || 0,
        actual_overhead_cost: Number(completeForm.actual_overhead_cost) || 0,
        materials: mats,
      })
      addToast({ type: 'success', title: 'Completed', message: `Cost per unit: ${formatCurrency(r.cost_per_unit)}` })
      setCompletingId(null); load(); if (viewId) viewOrder(viewId)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleCancel = async () => {
    if (!user || !cancelling) return
    try {
      await api.fabrication.fab.cancel(user.id, cancelling.id)
      addToast({ type: 'success', title: 'Cancelled', message: 'Fabrication order cancelled' })
      setCancelling(null); load(); if (viewId) viewOrder(viewId)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const refreshDetail = () => { if (viewId) viewOrder(viewId) }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-40 text-sm">
            <option value="">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-sm text-gray-500">{items.length} order(s)</span>
        </div>
        <button onClick={() => { setForm(emptyForm); setSelectedBomDetail(null); setShowCreate(true) }} className="btn-primary gap-2"><Plus size={16} /> New Order</button>
      </div>

      <DataTable
        data={items}
        columns={[
          { key: 'fab_order_number', header: 'Order #', render: (r) => <span className="font-mono text-xs font-medium">{r.fab_order_number}</span> },
          { key: 'finished_item_name', header: 'Item' },
          { key: 'bom_name', header: 'BOM' },
          { key: 'quantity_to_produce', header: 'To Produce' },
          { key: 'quantity_produced', header: 'Produced', render: (r) => r.quantity_produced > 0 ? r.quantity_produced : '-' },
          { key: 'warehouse_name', header: 'Warehouse' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'cost_per_unit', header: 'Cost/Unit', render: (r) => r.cost_per_unit > 0 ? formatCurrency(r.cost_per_unit) : '-' },
          { key: 'id', header: 'Actions', render: (r) => (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => viewOrder(r.id)} className="rounded p-1 text-gray-400 hover:text-gray-600" title="View"><Eye size={14} /></button>
              {r.status === 'planned' && (
                <button onClick={() => { setStarting(r); setStartOverride(false) }} className="rounded p-1 text-blue-500 hover:text-blue-700" title="Start"><Play size={14} /></button>
              )}
              {(r.status === 'planned' || r.status === 'in_progress') && (
                <>
                  {r.status === 'in_progress' && (
                    <button onClick={() => openComplete(r.id)} className="rounded p-1 text-green-600 hover:text-green-700" title="Complete"><CheckCircle size={14} /></button>
                  )}
                  <button onClick={() => setCancelling(r)} className="rounded p-1 text-red-500 hover:text-red-700" title="Cancel"><XCircle size={14} /></button>
                </>
              )}
            </div>
          )},
        ]}
      />

      {/* Create modal */}
      <FormModal open={showCreate} title="New Fabrication Order" onClose={() => setShowCreate(false)} onSubmit={handleCreate} submitLabel="Create Order">
        <div className="grid gap-4 md:grid-cols-2">
          <SearchableSelect label="BOM *" options={boms} value={form.bom_id} onChange={(v) => { setForm({ ...form, bom_id: v }); onBomChange(v) }} placeholder="Select BOM" />
          <div><label className="label-text mb-1">Qty to Produce *</label><input type="number" step="0.01" min="0" value={form.quantity_to_produce} onChange={(e) => setForm({ ...form, quantity_to_produce: e.target.value })} className="input-field" /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SearchableSelect label="Warehouse *" options={warehouses} value={form.warehouse_id} onChange={(v) => setForm({ ...form, warehouse_id: v })} placeholder="Select warehouse" />
          <div><label className="label-text mb-1">Date Started</label><input type="date" value={form.date_started} onChange={(e) => setForm({ ...form, date_started: e.target.value })} className="input-field" /></div>
        </div>
        <div><label className="label-text mb-1">Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" /></div>

        {selectedBomDetail && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Material Requirements</p>
            <table className="min-w-full text-xs">
              <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Raw Material</th><th className="py-1 pr-2">Per BOM</th><th className="py-1 pr-2">Scale Factor</th><th className="py-1">Required</th></tr></thead>
              <tbody>
                {(() => {
                  const scale = (Number(form.quantity_to_produce) || 1) / (selectedBomDetail.output_quantity || 1)
                  return selectedBomDetail.components?.map((c: any) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="py-1 pr-2">{c.raw_material_name}</td>
                      <td className="py-1 pr-2">{c.quantity_required}</td>
                      <td className="py-1 pr-2">{scale.toFixed(2)}x</td>
                      <td className="py-1 font-medium">{(c.quantity_required * scale).toFixed(2)} {c.unit_short_code ?? ''}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        )}
      </FormModal>

      {/* Detail drawer */}
      {viewId && viewData && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="bg-black/30 flex-1" onClick={() => { setViewId(null); setViewData(null) }} />
          <div className="w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{viewData.fab_order_number}</h3>
              <button onClick={() => { setViewId(null); setViewData(null) }} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Status:</span> <StatusBadge status={viewData.status} /></div>
                <div><span className="text-gray-500">BOM:</span> <span className="font-medium">{viewData.bom_name}</span></div>
                <div><span className="text-gray-500">Finished Item:</span> <span className="font-medium">{viewData.finished_item_name}</span></div>
                <div><span className="text-gray-500">Warehouse:</span> <span>{viewData.warehouse_name}</span></div>
                <div><span className="text-gray-500">Qty to Produce:</span> <span>{viewData.quantity_to_produce}</span></div>
                <div><span className="text-gray-500">Qty Produced:</span> <span>{viewData.quantity_produced || '-'}</span></div>
                {viewData.date_started && <div><span className="text-gray-500">Started:</span> <span>{formatDate(viewData.date_started)}</span></div>}
                {viewData.date_completed && <div><span className="text-gray-500">Completed:</span> <span>{formatDate(viewData.date_completed)}</span></div>}
              </div>

              {/* Materials */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Materials Consumed</h4>
                <table className="min-w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Qty Consumed</th><th className="py-1 pr-2">Unit Cost</th><th className="py-1">Total Cost</th></tr></thead>
                  <tbody>
                    {viewData.materials?.length === 0 ? (
                      <tr><td colSpan={4} className="py-2 text-center text-gray-400">No materials recorded</td></tr>
                    ) : viewData.materials?.map((m: any) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="py-1 pr-2">{m.raw_material_name}</td>
                        <td className="py-1 pr-2">{m.quantity_consumed}</td>
                        <td className="py-1 pr-2">{formatCurrency(m.unit_cost)}</td>
                        <td className="py-1">{formatCurrency(m.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cost summary */}
              {viewData.status === 'completed' && (
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex justify-between"><span>Material Cost:</span><span>{formatCurrency(viewData.total_material_cost)}</span></div>
                  <div className="flex justify-between"><span>Labor Cost:</span><span>{formatCurrency(viewData.actual_labor_cost)}</span></div>
                  <div className="flex justify-between"><span>Overhead Cost:</span><span>{formatCurrency(viewData.actual_overhead_cost)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span>{formatCurrency(viewData.total_fabrication_cost)}</span></div>
                  <div className="flex justify-between text-blue-700 font-bold"><span>Cost Per Unit:</span><span>{formatCurrency(viewData.cost_per_unit)}</span></div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {viewData.status === 'planned' && (
                  <button onClick={() => { setStarting(viewData); setStartOverride(false) }} className="btn-primary gap-2"><Play size={16} /> Start Fabrication</button>
                )}
                {viewData.status === 'in_progress' && (
                  <button onClick={() => openComplete(viewData.id)} className="btn-primary gap-2"><CheckCircle size={16} /> Complete</button>
                )}
                {(viewData.status === 'planned' || viewData.status === 'in_progress') && (
                  <button onClick={() => setCancelling(viewData)} className="btn-secondary gap-2 text-red-600"><XCircle size={16} /> Cancel</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start confirm */}
      <ConfirmDialog
        open={!!starting}
        title="Start Fabrication"
        message={startOverride ? 'Insufficient stock detected. Override and proceed anyway?' : `Start "${starting?.fab_order_number}"? Raw materials will be issued from ${starting?.warehouse_name}.`}
        onConfirm={handleStart}
        onCancel={() => { setStarting(null); setStartOverride(false) }}
        confirmLabel={startOverride ? 'Override & Start' : 'Start'}
      />

      {/* Complete modal */}
      <FormModal open={!!completingId} title="Complete Fabrication Order" onClose={() => setCompletingId(null)} onSubmit={handleComplete} submitLabel="Complete">
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label-text mb-1">Qty Produced *</label><input type="number" step="0.01" min="0" value={completeForm.quantity_produced} onChange={(e) => setCompleteForm({ ...completeForm, quantity_produced: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Actual Labor Cost</label><input type="number" step="0.01" min="0" value={completeForm.actual_labor_cost} onChange={(e) => setCompleteForm({ ...completeForm, actual_labor_cost: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Actual Overhead</label><input type="number" step="0.01" min="0" value={completeForm.actual_overhead_cost} onChange={(e) => setCompleteForm({ ...completeForm, actual_overhead_cost: e.target.value })} className="input-field" /></div>
        </div>

        {/* Editable material consumption */}
        {viewData?.materials && viewData.id === completingId && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Actual Material Consumption (editable)</p>
            {viewData.materials.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 mb-2">
                <span className="flex-1 text-sm">{m.raw_material_name}</span>
                <input
                  type="number" step="0.01" min="0"
                  value={materialOverrides[m.id] ?? m.quantity_consumed}
                  onChange={(e) => setMaterialOverrides({ ...materialOverrides, [m.id]: e.target.value })}
                  className="input-field text-sm w-24"
                />
                <span className="text-xs text-gray-500 w-16">{m.unit_short_code ?? ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cost preview */}
        {(() => {
          const qty = Number(completeForm.quantity_produced) || 0
          const lab = Number(completeForm.actual_labor_cost) || 0
          const ovh = Number(completeForm.actual_overhead_cost) || 0
          let matCost = 0
          if (viewData?.materials) {
            matCost = viewData.materials.reduce((s: number, m: any) => {
              const qtyC = Number(materialOverrides[m.id] ?? m.quantity_consumed) || 0
              return s + qtyC * m.unit_cost
            }, 0)
          }
          const total = matCost + lab + ovh
          const cpu = qty > 0 ? total / qty : 0
          return (
            <div className="border-t pt-3 rounded-lg bg-gray-50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Material Cost:</span><span>{formatCurrency(matCost)}</span></div>
              <div className="flex justify-between"><span>Labor:</span><span>{formatCurrency(lab)}</span></div>
              <div className="flex justify-between"><span>Overhead:</span><span>{formatCurrency(ovh)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total Cost:</span><span>{formatCurrency(total)}</span></div>
              <div className="flex justify-between text-blue-700"><span>Cost Per Unit:</span><span className="font-bold">{formatCurrency(cpu)}</span></div>
            </div>
          )
        })()}
      </FormModal>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelling}
        title="Cancel Fabrication Order"
        message={`Cancel "${cancelling?.fab_order_number}"? ${cancelling?.status === 'in_progress' ? 'Raw materials will be returned to stock.' : ''}`}
        onConfirm={handleCancel}
        onCancel={() => setCancelling(null)}
        destructive
        confirmLabel="Cancel Order"
      />
    </div>
  )
}
