import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Pencil, Trash2, CornerDownRight, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatDate } from '../../lib/format.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { PurchaseOrderRow, ItemWithStock } from '../../lib/types.js'

const emptyForm = { vendor_id: '' as string | number, date: new Date().toISOString().split('T')[0], notes: '' }
const emptyLineItem = { item_id: '' as string | number, quantity: '', rate: '' }

export default function PurchaseOrdersTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [items, setItems] = useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchVendor, setSearchVendor] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [lineItems, setLineItems] = useState<Array<{ item_id: string | number; quantity: string; rate: string }>>([{ ...emptyLineItem }])
  const [deleting, setDeleting] = useState<PurchaseOrderRow | null>(null)
  const [vendors, setVendors] = useState<Array<{ value: string | number; label: string }>>([])
  const [itemsOption, setItemsOption] = useState<Array<{ value: string | number; label: string }>>([])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.purchases.po.list(user.id, {
        ...(searchVendor ? { vendor_id: Number(searchVendor) } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      setItems(list)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load POs' }) }
    finally { setLoading(false) }
  }, [user, searchVendor, statusFilter, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const v = await api.vendors.list(user.id, { isActive: true })
      setVendors(v.map((x) => ({ value: x.id, label: `${x.name} (${x.vendor_code ?? ''})` })))
      const inv = await api.inventory.listItems(user.id)
      setItemsOption(inv.map((x) => ({ value: x.id, label: `${x.item_code ?? ''} - ${x.name}` })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setLineItems([{ ...emptyLineItem }])
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!form.vendor_id || !form.date) {
      addToast({ type: 'warning', title: 'Validation', message: 'Vendor and date are required' })
      return
    }
    const itemsData = lineItems.filter((li) => li.item_id && li.quantity && li.rate).map((li) => ({
      item_id: Number(li.item_id), quantity: Number(li.quantity), rate: Number(li.rate),
    }))
    if (itemsData.length === 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Add at least one line item' })
      return
    }
    try {
      if (editing) {
        await api.purchases.po.update(user.id, editing.id, {
          vendor_id: Number(form.vendor_id), date: form.date, notes: form.notes || undefined,
          items: itemsData,
        })
        addToast({ type: 'success', title: 'Updated', message: 'PO updated' })
      } else {
        const r = await api.purchases.po.create(user.id, {
          vendor_id: Number(form.vendor_id), date: form.date, notes: form.notes || undefined,
          items: itemsData,
        })
        addToast({ type: 'success', title: 'Created', message: `PO ${r.po_number} created` })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleDelete = async () => {
    if (!user || !deleting) return
    try {
      await api.purchases.po.delete(user.id, deleting.id)
      addToast({ type: 'success', title: 'Deleted', message: 'PO deleted' })
      setDeleting(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const addLineItem = () => setLineItems([...lineItems, { ...emptyLineItem }])
  const removeLineItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx))
  const updateLineItem = (idx: number, field: string, value: string | number) => {
    const next = [...lineItems]
    next[idx] = { ...next[idx], [field]: value }
    setLineItems(next)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-40 text-sm">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-sm text-gray-500">{items.length} PO(s)</span>
        </div>
        <button onClick={openAdd} className="btn-primary gap-2"><Plus size={16} /> New PO</button>
      </div>

      <DataTable
        data={items}
        columns={[
          { key: 'po_number', header: 'PO #', render: (r) => <span className="font-mono text-xs font-medium">{r.po_number}</span> },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
          { key: 'vendor_name', header: 'Vendor' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '-' },
          { key: 'id', header: '', render: (r) => (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.status === 'draft' && (
                <>
                  <button onClick={() => { setEditing(r); setShowModal(true); setForm({ vendor_id: r.vendor_id, date: r.date, notes: r.notes ?? '' }); setLineItems([{ ...emptyLineItem }]) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                  <button onClick={() => setDeleting(r)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          )},
        ]}
      />

      <FormModal open={showModal} title={editing ? 'Edit PO' : 'New Purchase Order'} onClose={() => setShowModal(false)} onSubmit={handleSubmit} submitLabel={editing ? 'Update' : 'Create PO'}>
        <div className="grid gap-4 md:grid-cols-2">
          <SearchableSelect label="Vendor *" options={vendors} value={form.vendor_id} onChange={(v) => setForm({ ...form, vendor_id: v })} placeholder="Select vendor" />
          <div>
            <label className="label-text mb-1">Date *</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
          </div>
        </div>
        <div>
          <label className="label-text mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} placeholder="Optional notes" />
        </div>

        <div className="border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Line Items</span>
            <button onClick={addLineItem} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> Add Row</button>
          </div>
          <div className="space-y-2">
            {lineItems.map((li, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    options={itemsOption}
                    value={li.item_id}
                    onChange={(v) => updateLineItem(idx, 'item_id', v)}
                    placeholder="Select item"
                  />
                </div>
                <div className="w-20">
                  <label className="label-text text-xs">Qty</label>
                  <input type="number" step="0.01" min="0" value={li.quantity} onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="w-24">
                  <label className="label-text text-xs">Rate</label>
                  <input type="number" step="0.01" min="0" value={li.rate} onChange={(e) => updateLineItem(idx, 'rate', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="w-20 text-right pt-5 text-sm text-gray-600">
                  {li.quantity && li.rate ? (Number(li.quantity) * Number(li.rate)).toFixed(2) : '0.00'}
                </div>
                {lineItems.length > 1 && (
                  <button onClick={() => removeLineItem(idx)} className="pt-5 text-gray-400 hover:text-red-500"><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </FormModal>

      <ConfirmDialog open={!!deleting} title="Delete PO" message={`Delete PO "${deleting?.po_number}"? Only draft POs can be deleted.`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} destructive confirmLabel="Delete" />
    </div>
  )
}
