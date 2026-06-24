import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Power, PowerOff, Calculator, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency } from '../../lib/format.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { BOMRow, BOMDetail, ItemWithStock, BOMCostEstimate } from '../../lib/types.js'

const emptyForm = { finished_item_id: '' as string | number, name: '', output_quantity: '1', labor_cost_estimate: '', overhead_cost_estimate: '', notes: '' }
const emptyLine = { raw_material_item_id: '' as string | number, quantity_required: '', wastage_percent: '' }

export default function BOMTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [items, setItems] = useState<BOMRow[]>([])
  const [loading, setLoading] = useState(false)

  // Form
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BOMRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState<Array<typeof emptyLine>>([{ ...emptyLine }])

  // Cost estimate
  const [costEst, setCostEst] = useState<BOMCostEstimate | null>(null)

  // Deactivate
  const [toggling, setToggling] = useState<BOMRow | null>(null)

  // Reference data
  const [fgItems, setFgItems] = useState<Array<{ value: string | number; label: string }>>([])
  const [rmItems, setRmItems] = useState<Array<{ value: string | number; label: string }>>([])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const all = await api.inventory.listItems(user.id, { is_active: true })
      setFgItems(
        all
          .filter((i) => i.item_type === 'finished_good' || i.item_type === 'fabricated')
          .map((i) => ({ value: i.id, label: `${i.item_code ?? ''} - ${i.name}` }))
      )
      setRmItems(
        all
          .filter((i) => i.item_type === 'raw_material')
          .map((i) => ({ value: i.id, label: `${i.item_code ?? ''} - ${i.name}` }))
      )
    } catch { /* ignore */ }
  }, [user])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setItems(await api.fabrication.bom.list(user.id))
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load BOMs' }) }
    finally { setLoading(false) }
  }, [user, addToast])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])

  const openAdd = () => {
    setEditing(null); setForm(emptyForm); setLines([{ ...emptyLine }]); setCostEst(null); setShowModal(true)
  }

  const openEdit = async (bom: BOMRow) => {
    if (!user) return
    setEditing(bom)
    try {
      const d = await api.fabrication.bom.getById(user.id, bom.id)
      if (!d) return
      setForm({
        finished_item_id: d.finished_item_id,
        name: d.name,
        output_quantity: String(d.output_quantity),
        labor_cost_estimate: String(d.labor_cost_estimate || ''),
        overhead_cost_estimate: String(d.overhead_cost_estimate || ''),
        notes: d.notes ?? '',
      })
      setLines(d.components.map((c) => ({
        raw_material_item_id: c.raw_material_item_id,
        quantity_required: String(c.quantity_required),
        wastage_percent: String(c.wastage_percent || ''),
      })))
      setCostEst(null)
      setShowModal(true)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load BOM details' }) }
  }

  const calcCostEstimate = async () => {
    if (!user) return
    // Use the form data to estimate live from API
    if (editing) {
      try {
        const est = await api.fabrication.bom.costEstimate(user.id, editing.id)
        setCostEst(est)
      } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to calculate estimate' }) }
    }
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!form.name || !form.finished_item_id) {
      addToast({ type: 'warning', title: 'Validation', message: 'Name and finished item are required' })
      return
    }
    const comps = lines.filter((l) => l.raw_material_item_id && l.quantity_required)
    if (comps.length === 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Add at least one raw material component' })
      return
    }
    try {
      const data = {
        finished_item_id: Number(form.finished_item_id),
        name: form.name,
        output_quantity: Number(form.output_quantity) || 1,
        labor_cost_estimate: Number(form.labor_cost_estimate) || 0,
        overhead_cost_estimate: Number(form.overhead_cost_estimate) || 0,
        notes: form.notes || undefined,
        components: comps.map((c) => ({
          raw_material_item_id: Number(c.raw_material_item_id),
          quantity_required: Number(c.quantity_required),
          wastage_percent: Number(c.wastage_percent) || 0,
        })),
      }
      if (editing) {
        await api.fabrication.bom.update(user.id, editing.id, data)
        addToast({ type: 'success', title: 'Updated', message: 'BOM updated' })
      } else {
        await api.fabrication.bom.create(user.id, data)
        addToast({ type: 'success', title: 'Created', message: 'BOM created' })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleToggle = async () => {
    if (!user || !toggling) return
    try {
      await api.fabrication.bom.deactivate(user.id, toggling.id)
      addToast({ type: 'success', title: 'Updated', message: `BOM ${toggling.is_active ? 'deactivated' : 'activated'}` })
      setToggling(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const addLine = () => setLines([...lines, { ...emptyLine }])
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i))
  const updLine = (i: number, f: string, v: string | number) => {
    const n = [...lines]; n[i] = { ...n[i], [f]: v }; setLines(n)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">{items.length} BOM(s)</span>
        <button onClick={openAdd} className="btn-primary gap-2"><Plus size={16} /> New BOM</button>
      </div>

      <DataTable
        data={items}
        columns={[
          { key: 'name', header: 'BOM Name' },
          { key: 'finished_item_name', header: 'Finished Item' },
          { key: 'output_quantity', header: 'Output Qty' },
          { key: 'labor_cost_estimate', header: 'Labor Est.', render: (r) => formatCurrency(r.labor_cost_estimate) },
          { key: 'overhead_cost_estimate', header: 'Overhead Est.', render: (r) => formatCurrency(r.overhead_cost_estimate) },
          { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
          { key: 'id', header: 'Actions', render: (r) => (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openEdit(r)} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
              <button onClick={() => setToggling(r)} className="rounded p-1 text-gray-400 hover:text-gray-600">
                {r.is_active ? <PowerOff size={14} /> : <Power size={14} />}
              </button>
            </div>
          )},
        ]}
      />

      <FormModal open={showModal} title={editing ? 'Edit BOM' : 'New BOM'} onClose={() => setShowModal(false)} onSubmit={handleSubmit} submitLabel={editing ? 'Update' : 'Create BOM'}>
        <div className="grid gap-4 md:grid-cols-2">
          <SearchableSelect label="Finished Item *" options={fgItems} value={form.finished_item_id} onChange={(v) => setForm({ ...form, finished_item_id: v })} placeholder="Select finished good/fabricated" />
          <div><label className="label-text mb-1">BOM Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Duct Section 2x2" /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label-text mb-1">Output Quantity</label><input type="number" step="0.01" min="0" value={form.output_quantity} onChange={(e) => setForm({ ...form, output_quantity: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Labor Cost Est.</label><input type="number" step="0.01" min="0" value={form.labor_cost_estimate || '0'} onChange={(e) => setForm({ ...form, labor_cost_estimate: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Overhead Cost Est.</label><input type="number" step="0.01" min="0" value={form.overhead_cost_estimate || '0'} onChange={(e) => setForm({ ...form, overhead_cost_estimate: e.target.value })} className="input-field" /></div>
        </div>
        <div><label className="label-text mb-1">Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" /></div>

        {/* Components */}
        <div className="border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Raw Material Components</span>
            <button onClick={addLine} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> Add Component</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1 pr-2 w-1/2">Raw Material</th><th className="py-1 pr-2 w-20">Qty Required</th><th className="py-1 pr-2 w-16">Wastage %</th><th className="w-6"></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1 pr-2"><SearchableSelect options={rmItems} value={l.raw_material_item_id} onChange={(v) => updLine(i, 'raw_material_item_id', v)} placeholder="Select raw material" /></td>
                    <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.quantity_required} onChange={(e) => updLine(i, 'quantity_required', e.target.value)} className="input-field text-xs w-full" /></td>
                    <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.wastage_percent} onChange={(e) => updLine(i, 'wastage_percent', e.target.value)} className="input-field text-xs w-full" /></td>
                    <td className="py-1">{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Estimate */}
        {editing && (
          <div className="border-t pt-3">
            <button type="button" onClick={calcCostEstimate} className="btn-secondary gap-1 text-xs"><Calculator size={14} /> Calculate Estimate</button>
            {costEst && (
              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Material Cost:</span><span>{formatCurrency(costEst.material_cost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Labor Estimate:</span><span>{formatCurrency(costEst.labor_cost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Overhead Estimate:</span><span>{formatCurrency(costEst.overhead_cost)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span>{formatCurrency(costEst.total_cost)}</span></div>
                <div className="flex justify-between text-blue-700"><span>Cost Per Unit:</span><span className="font-bold">{formatCurrency(costEst.cost_per_unit)}</span></div>
              </div>
            )}
          </div>
        )}
      </FormModal>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ display: toggling ? 'flex' : 'none' }}>
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-gray-900">{toggling?.is_active ? 'Deactivate BOM' : 'Activate BOM'}</h3>
          <p className="mt-2 text-sm text-gray-600">{toggling?.is_active ? 'Deactivate' : 'Activate'} "{toggling?.name}"?</p>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setToggling(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleToggle} className={`rounded-md px-4 py-2 text-sm font-medium text-white ${toggling?.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-navy-800 hover:bg-navy-900'}`}>{toggling?.is_active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
