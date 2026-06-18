import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Search, DollarSign, X, Eye, Ban } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { PurchaseInvoiceRow, ItemWithStock, OutstandingInvoice, VendorPaymentRow } from '../../lib/types.js'

const emptyHeader = {
  vendor_id: '' as string | number, vendor_invoice_no: '', date: new Date().toISOString().split('T')[0],
  warehouse_id: '' as string | number, purchase_order_id: '' as string | number,
  discount_percent: '', withholding_tax_percent: '', other_charges: '', notes: '',
  gst_percent: '',
}
const emptyLine = { item_id: '' as string | number, quantity: '', rate: '', discount_percent: '', gst_percent: '' }

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function PurchaseInvoicesTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const settings = useSettingsStore((s) => s.settings)

  const [items, setItems] = useState<PurchaseInvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ payment_status: '', date_from: '', date_to: '' })

  // New invoice modal
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [header, setHeader] = useState(emptyHeader)
  const [lines, setLines] = useState<Array<typeof emptyLine>>([{ ...emptyLine }])

  // Reference data
  const [vendors, setVendors] = useState<Array<{ value: string | number; label: string }>>([])
  const [itemsOpt, setItemsOpt] = useState<Array<{ value: string | number; label: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ value: string | number; label: string }>>([])

  // View detail modal
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewData, setViewData] = useState<any>(null)

  // Void
  const [voidTarget, setVoidTarget] = useState<PurchaseInvoiceRow | null>(null)
  const [voidReason, setVoidReason] = useState('')

  // Payment modal
  const [payTarget, setPayTarget] = useState<PurchaseInvoiceRow | null>(null)
  const [payForm, setPayForm] = useState({
    vendor_id: '' as string | number, date: new Date().toISOString().split('T')[0],
    amount: '', payment_method: 'bank_transfer', bank_account_id: '' as string | number, reference_no: '', notes: '',
  })
  const [outstandingInvs, setOutstandingInvs] = useState<OutstandingInvoice[]>([])
  const [allocations, setAllocations] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.purchases.pi.list(user.id, {
        ...(filters.payment_status ? { payment_status: filters.payment_status } : {}),
        ...(filters.date_from ? { date_from: filters.date_from } : {}),
        ...(filters.date_to ? { date_to: filters.date_to } : {}),
      })
      setItems(list)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load invoices' }) }
    finally { setLoading(false) }
  }, [user, filters, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const [v, i, w] = await Promise.all([
        api.vendors.list(user.id, { isActive: true }),
        api.inventory.listItems(user.id, { is_active: true }),
        api.inventory.listWarehouses(),
      ])
      setVendors(v.map((x) => ({ value: x.id, label: `${x.name} (${x.vendor_code ?? ''})` })))
      setItemsOpt(i.map((x) => ({ value: x.id, label: `${x.item_code ?? ''} - ${x.name}` })))
      setWarehouses(w.filter((wh) => wh.is_active).map((x) => ({ value: x.id, label: x.name })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])

  // Autocalculate totals
  const calc = useMemo(() => {
    let subtotal = 0
    const lineDetails = lines.map((li) => {
      const qty = Number(li.quantity) || 0
      const rate = Number(li.rate) || 0
      const lineTotal = qty * rate
      const discPct = Number(li.discount_percent) || 0
      const discAmt = round2(lineTotal * discPct / 100)
      const amount = round2(lineTotal - discAmt)
      const gstPct = Number(li.gst_percent) || 0
      const gstAmt = round2(amount * gstPct / 100)
      subtotal += amount
      return { qty, rate, lineTotal, discPct, discAmt, amount, gstPct, gstAmt }
    })
    subtotal = round2(subtotal)
    const headerDiscPct = Number(header.discount_percent) || 0
    const headerDiscAmt = round2(subtotal * headerDiscPct / 100)
    const afterDisc = round2(subtotal - headerDiscAmt)
    const gstTotal = lineDetails.reduce((s, li) => s + li.gstAmt, 0)
    const whtPct = Number(header.withholding_tax_percent) || 0
    const whtAmt = round2(afterDisc * whtPct / 100)
    const other = Number(header.other_charges) || 0
    const grandTotal = round2(afterDisc + gstTotal + other - whtAmt)
    return { subtotal, headerDiscAmt, gstTotal, whtPct, whtAmt, other, grandTotal }
  }, [lines, header.discount_percent, header.withholding_tax_percent, header.other_charges])

  const openNewInvoice = () => {
    setHeader({
      ...emptyHeader,
      gst_percent: settings.default_gst_percent || '18',
      withholding_tax_percent: settings.default_wht_percent || '4.5',
    })
    setLines([{ ...emptyLine }])
    setShowNewInvoice(true)
  }

  const handleCreateInvoice = async () => {
    if (!user) return
    if (!header.vendor_id || !header.date || !header.warehouse_id) {
      addToast({ type: 'warning', title: 'Validation', message: 'Vendor, date, and warehouse are required' })
      return
    }
    const itemsData = lines.filter((l) => l.item_id && l.quantity && l.rate).map((l) => ({
      item_id: Number(l.item_id), quantity: Number(l.quantity), rate: Number(l.rate),
      discount_percent: Number(l.discount_percent) || 0,
      gst_percent: Number(l.gst_percent) || 0,
    }))
    if (itemsData.length === 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Add at least one line item' })
      return
    }
    try {
      const r = await api.purchases.pi.create(user.id, {
        vendor_id: Number(header.vendor_id),
        vendor_invoice_no: header.vendor_invoice_no || undefined,
        date: header.date,
        warehouse_id: Number(header.warehouse_id),
        purchase_order_id: header.purchase_order_id ? Number(header.purchase_order_id) : undefined,
        notes: header.notes || undefined,
        discount_percent: Number(header.discount_percent) || 0,
        gst_percent: Number(header.gst_percent) || 0,
        withholding_tax_percent: Number(header.withholding_tax_percent) || 0,
        other_charges: Number(header.other_charges) || 0,
        items: itemsData,
      })
      addToast({ type: 'success', title: 'Created', message: `Invoice ${r.invoice_number} created` })
      setShowNewInvoice(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const viewInvoice = async (id: number) => {
    setViewId(id)
    try {
      const d = await api.purchases.pi.getById(user!.id, id)
      setViewData(d)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load invoice details' }) }
  }

  const handleVoid = async () => {
    if (!user || !voidTarget || !voidReason.trim()) {
      addToast({ type: 'warning', title: 'Validation', message: 'Void reason is required' })
      return
    }
    try {
      await api.purchases.pi.void(user.id, voidTarget.id, voidReason)
      addToast({ type: 'success', title: 'Voided', message: 'Invoice voided successfully' })
      setVoidTarget(null); setVoidReason(''); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  // Payment
  const openPayment = async (inv?: PurchaseInvoiceRow) => {
    if (!user) return
    setPayForm({
      ...payForm, date: new Date().toISOString().split('T')[0],
      vendor_id: inv?.vendor_id ?? '',
    })
    setPayTarget(inv ?? null)
    setAllocations({})
    if (inv) {
      try {
        const outstanding = await api.purchases.pi.getOutstanding(user.id, inv.vendor_id)
        setOutstandingInvs(outstanding)
        const bal = inv.total_amount - inv.amount_paid
        setPayForm((p) => ({ ...p, amount: String(bal), vendor_id: inv.vendor_id }))
        setAllocations({ [inv.id]: String(bal) })
      } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load outstanding invoices' }) }
    }
  }

  const handlePayment = async () => {
    if (!user) return
    const amt = Number(payForm.amount)
    if (!payForm.vendor_id || !payForm.date || !amt || amt <= 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Vendor, date, and valid amount are required' })
      return
    }
    const allocs = Object.entries(allocations)
      .filter(([_, a]) => Number(a) > 0)
      .map(([invId, a]) => ({ purchase_invoice_id: Number(invId), amount: Number(a) }))
    if (allocs.length === 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Allocate payment to at least one invoice' })
      return
    }
    try {
      const r = await api.purchases.payment.record(user.id, {
        vendor_id: Number(payForm.vendor_id), date: payForm.date, amount: amt,
        payment_method: payForm.payment_method,
        bank_account_id: payForm.bank_account_id ? Number(payForm.bank_account_id) : undefined,
        reference_no: payForm.reference_no || undefined,
        notes: payForm.notes || undefined,
        allocations: allocs,
      })
      addToast({ type: 'success', title: 'Payment Recorded', message: `Payment ${r.payment_number} recorded` })
      setPayTarget(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const addLine = () => setLines([...lines, { ...emptyLine, gst_percent: header.gst_percent || '' }])
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i))
  const updLine = (i: number, f: string, v: string | number) => {
    const n = [...lines]; n[i] = { ...n[i], [f]: v }; setLines(n)
  }

  const totalAllocated = Object.values(allocations).reduce((s, a) => s + (Number(a) || 0), 0)
  const balDue = Number(payForm.amount) - totalAllocated

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })} className="input-field w-36 text-sm">
            <option value="">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="input-field text-sm w-36" placeholder="From" />
          <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="input-field text-sm w-36" placeholder="To" />
          <span className="text-sm text-gray-500">{items.length} invoice(s)</span>
        </div>
        <button onClick={openNewInvoice} className="btn-primary gap-2"><Plus size={16} /> New Invoice</button>
      </div>

      <DataTable
        data={items}
        columns={[
          { key: 'invoice_number', header: 'Invoice #', render: (r) => <span className="font-mono text-xs font-medium">{r.invoice_number}</span> },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
          { key: 'vendor_name', header: 'Vendor' },
          { key: 'vendor_invoice_no', header: 'Vendor Inv #', render: (r) => r.vendor_invoice_no ?? '-' },
          { key: 'total_amount', header: 'Total', render: (r) => formatCurrency(r.total_amount) },
          { key: 'amount_paid', header: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
          { key: 'balance_due', header: 'Balance', render: (r) => <span className="font-medium">{formatCurrency(r.balance_due)}</span> },
          { key: 'payment_status', header: 'Status', render: (r) => <StatusBadge status={r.payment_status} /> },
          { key: 'id', header: 'Actions', render: (r) => (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => viewInvoice(r.id)} className="rounded p-1 text-gray-400 hover:text-gray-600" title="View"><Eye size={14} /></button>
              {r.payment_status !== 'paid' && (
                <button onClick={() => openPayment(r)} className="rounded p-1 text-gray-400 hover:text-green-600" title="Record Payment"><DollarSign size={14} /></button>
              )}
              {(r.amount_paid === 0 || r.amount_paid === undefined) && !r.is_voided && (
                <button onClick={() => { setVoidTarget(r); setVoidReason('') }} className="rounded p-1 text-gray-400 hover:text-red-500" title="Void"><Ban size={14} /></button>
              )}
            </div>
          )},
        ]}
      />

      {/* New Invoice Modal */}
      <div className={`fixed inset-0 z-40 flex justify-end ${showNewInvoice ? '' : 'hidden'}`}>
        <div className="bg-black/30 flex-1" onClick={() => setShowNewInvoice(false)} />
        <div className="w-full max-w-3xl overflow-y-auto bg-white shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">New Purchase Invoice</h3>
            <button onClick={() => setShowNewInvoice(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="grid gap-4 md:grid-cols-3">
              <SearchableSelect label="Vendor *" options={vendors} value={header.vendor_id} onChange={(v) => setHeader({ ...header, vendor_id: v })} placeholder="Select vendor" />
              <div><label className="label-text mb-1">Vendor Invoice No.</label><input value={header.vendor_invoice_no} onChange={(e) => setHeader({ ...header, vendor_invoice_no: e.target.value })} className="input-field" /></div>
              <div><label className="label-text mb-1">Date *</label><input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} className="input-field" /></div>
              <SearchableSelect label="Warehouse *" options={warehouses} value={header.warehouse_id} onChange={(v) => setHeader({ ...header, warehouse_id: v })} placeholder="Select warehouse" />
              <div><label className="label-text mb-1">Notes</label><input value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} className="input-field" /></div>
            </div>

            {/* Line items */}
            <div className="border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Line Items</span>
                <button onClick={addLine} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> Add Row</button>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-1 pr-2 w-1/3">Item</th>
                    <th className="py-1 pr-2 w-16">Qty</th>
                    <th className="py-1 pr-2 w-20">Rate</th>
                    <th className="py-1 pr-2 w-12">Disc%</th>
                    <th className="py-1 pr-2 w-20">Amount</th>
                    <th className="py-1 pr-2 w-12">GST%</th>
                    <th className="py-1 pr-2 w-20">GST Amt</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const qty = Number(l.quantity) || 0; const rate = Number(l.rate) || 0
                    const lineTotal = qty * rate; const discPct = Number(l.discount_percent) || 0
                    const discAmt = round2(lineTotal * discPct / 100)
                    const amount = round2(lineTotal - discAmt)
                    const gstPct = Number(l.gst_percent) || 0; const gstAmt = round2(amount * gstPct / 100)
                    return (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1 pr-2"><SearchableSelect options={itemsOpt} value={l.item_id} onChange={(v) => updLine(i, 'item_id', v)} placeholder="Item" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => updLine(i, 'quantity', e.target.value)} className="input-field text-xs w-full" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => updLine(i, 'rate', e.target.value)} className="input-field text-xs w-full" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.discount_percent} onChange={(e) => updLine(i, 'discount_percent', e.target.value)} className="input-field text-xs w-full" /></td>
                        <td className="py-1 pr-2 text-right text-xs text-gray-600">{amount.toFixed(2)}</td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.gst_percent} onChange={(e) => updLine(i, 'gst_percent', e.target.value)} className="input-field text-xs w-full" /></td>
                        <td className="py-1 pr-2 text-right text-xs text-gray-600">{gstAmt.toFixed(2)}</td>
                        <td className="py-1">{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer totals */}
            <div className="border-t pt-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className="label-text mb-1 text-xs">Header Disc %</label>
                  <input type="number" step="0.01" min="0" value={header.discount_percent} onChange={(e) => setHeader({ ...header, discount_percent: e.target.value })} className="input-field text-sm" />
                </div>
                <div>
                  <label className="label-text mb-1 text-xs">WHT %</label>
                  <input type="number" step="0.01" min="0" value={header.withholding_tax_percent} onChange={(e) => setHeader({ ...header, withholding_tax_percent: e.target.value })} className="input-field text-sm" />
                </div>
                <div>
                  <label className="label-text mb-1 text-xs">Other Charges</label>
                  <input type="number" step="0.01" min="0" value={header.other_charges} onChange={(e) => setHeader({ ...header, other_charges: e.target.value })} className="input-field text-sm" />
                </div>
              </div>
              <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal:</span><span>{formatCurrency(calc.subtotal)}</span></div>
                {calc.headerDiscAmt > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount:</span><span className="text-red-600">-{formatCurrency(calc.headerDiscAmt)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">GST Total:</span><span>{formatCurrency(calc.gstTotal)}</span></div>
                {calc.whtAmt > 0 && <div className="flex justify-between"><span className="text-gray-500">WHT ({calc.whtPct}%):</span><span className="text-red-600">-{formatCurrency(calc.whtAmt)}</span></div>}
                {calc.other > 0 && <div className="flex justify-between"><span className="text-gray-500">Other Charges:</span><span>{formatCurrency(calc.other)}</span></div>}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Grand Total:</span><span>{formatCurrency(calc.grandTotal)}</span></div>
              </div>

              {/* Stock impact preview */}
              {lines.filter((l) => l.item_id && l.quantity).length > 0 && (
                <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                  <p className="font-medium mb-1">Stock Impact Preview:</p>
                  {lines.filter((l) => l.item_id && l.quantity).map((l, i) => {
                    const item = itemsOpt.find((o) => o.value === l.item_id)
                    return <p key={i}>• Will increase stock of <strong>{item?.label ?? `item #${l.item_id}`}</strong> by <strong>{l.quantity} qty</strong></p>
                  })}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowNewInvoice(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateInvoice} className="btn-primary">Create Invoice</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Invoice Modal */}
      <FormModal open={!!viewData} title={viewData ? `Invoice ${viewData.invoice_number}` : ''} onClose={() => { setViewId(null); setViewData(null) }}>
        {viewData && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">Vendor:</span> <span className="font-medium">{viewData.vendor_name}</span></div>
              <div><span className="text-gray-500">Date:</span> <span>{formatDate(viewData.date)}</span></div>
              <div><span className="text-gray-500">Vendor Inv#:</span> <span>{viewData.vendor_invoice_no ?? '-'}</span></div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={viewData.payment_status} /></div>
            </div>
            <table className="min-w-full text-xs">
              <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Qty</th><th className="py-1 pr-2">Rate</th><th className="py-1 pr-2">Disc%</th><th className="py-1 pr-2">Amount</th><th className="py-1">GST</th></tr></thead>
              <tbody>
                {viewData.items?.map((li: any) => (
                  <tr key={li.id} className="border-b border-gray-50">
                    <td className="py-1 pr-2">{li.item_name}</td>
                    <td className="py-1 pr-2">{li.quantity}</td>
                    <td className="py-1 pr-2">{formatCurrency(li.rate)}</td>
                    <td className="py-1 pr-2">{li.discount_percent}%</td>
                    <td className="py-1 pr-2">{formatCurrency(li.amount)}</td>
                    <td className="py-1">{li.gst_percent}% ({formatCurrency(li.gst_amount)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t pt-2">
              <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(viewData.subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount:</span><span>-{formatCurrency(viewData.discount)}</span></div>
              <div className="flex justify-between"><span>GST:</span><span>{formatCurrency(viewData.gst_amount)}</span></div>
              {viewData.withholding_tax_amount > 0 && <div className="flex justify-between"><span>WHT:</span><span>-{formatCurrency(viewData.withholding_tax_amount)}</span></div>}
              <div className="flex justify-between font-bold"><span>Total:</span><span>{formatCurrency(viewData.total_amount)}</span></div>
              <div className="flex justify-between"><span>Paid:</span><span>{formatCurrency(viewData.amount_paid)}</span></div>
            </div>
          </div>
        )}
      </FormModal>

      {/* Void Confirm */}
      <ConfirmDialog
        open={!!voidTarget}
        title="Void Purchase Invoice"
        message={`Void "${voidTarget?.invoice_number}"? This will reverse stock movements and accounting entries. A reason is required.`}
        onConfirm={handleVoid}
        onCancel={() => { setVoidTarget(null); setVoidReason('') }}
        destructive
        confirmLabel="Void Invoice"
        extraContent={
          <div className="mt-3">
            <label className="label-text mb-1">Void Reason *</label>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input-field" rows={2} placeholder="e.g., Duplicate entry, returned to vendor" />
          </div>
        }
      />

      {/* Payment modal */}
      <FormModal open={!!payTarget} title="Record Vendor Payment" onClose={() => setPayTarget(null)} onSubmit={handlePayment} submitLabel="Record Payment">
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Date</label><input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="input-field" /></div>
          <div>
            <label className="label-text mb-1">Payment Method</label>
            <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="input-field">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div><label className="label-text mb-1">Reference No.</label><input value={payForm.reference_no} onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })} className="input-field" placeholder="Cheque # / Ref" /></div>
          <div><label className="label-text mb-1">Notes</label><input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" /></div>
        </div>

        {/* Outstanding invoices */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Allocate Payment</p>
          {outstandingInvs.length === 0 ? (
            <p className="text-xs text-gray-400">No outstanding invoices for this vendor.</p>
          ) : (
            <table className="min-w-full text-xs">
              <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Invoice</th><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">Total</th><th className="py-1 pr-2">Due</th><th className="py-1">Amount</th></tr></thead>
              <tbody>
                {outstandingInvs.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50">
                    <td className="py-1 pr-2 font-mono">{inv.invoice_number}</td>
                    <td className="py-1 pr-2">{formatDate(inv.date)}</td>
                    <td className="py-1 pr-2">{formatCurrency(inv.total_amount)}</td>
                    <td className="py-1 pr-2 font-medium">{formatCurrency(inv.balance_due)}</td>
                    <td className="py-1">
                      <input type="number" step="0.01" min="0" max={inv.balance_due}
                        value={allocations[inv.id] ?? ''}
                        onChange={(e) => setAllocations({ ...allocations, [inv.id]: e.target.value })}
                        className="input-field text-xs w-24" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-2 flex justify-between text-sm font-medium">
            <span>Total Payment: <input type="number" step="0.01" min="0" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="input-field text-sm w-28 inline" /></span>
            <span className={balDue < -0.01 ? 'text-red-600' : 'text-gray-600'}>Allocated: {formatCurrency(totalAllocated)} {balDue < -0.01 ? `(overshoot ${formatCurrency(Math.abs(balDue))})` : ''}</span>
          </div>
        </div>
      </FormModal>
    </div>
  )
}
