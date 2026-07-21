import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Eye, DollarSign, Ban, Printer, Receipt as ReceiptIcon, List, X, Filter } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import { numberToWords } from '../../lib/numberToWords.js'
import { buildDocumentPrintHtml, mapSalesInvoiceToDocument, openDocumentPrintWindow } from '../../lib/documentPrint.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { SalesInvoiceRow, Customer, ProjectRow } from '../../lib/types.js'

type SubTab = 'invoices' | 'receipts'

const emptyLine = { item_id: '' as string | number, description: '', quantity: '1', unit: '', rate: '', gst_percent: '' }

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function Invoices() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const settings = useSettingsStore((s) => s.settings)
  const [activeTab, setActiveTab] = useState<SubTab>('invoices')
  const printRef = useRef<HTMLDivElement>(null)

  // List
  const [items, setItems] = useState<SalesInvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ payment_status: '', date_from: '', date_to: '', customer_id: '' as string | number, project_id: '' as string | number })
  const [filterProjects, setFilterProjects] = useState<Array<{ value: string | number; label: string }>>([])  // projects for filter dropdown
  const [customers, setCustomers] = useState<Array<{ value: string | number; label: string }>>([])

  // New invoice form
  const [showNew, setShowNew] = useState(false)
  const [header, setHeader] = useState({ customer_id: '' as string | number, project_id: '' as string | number, date: new Date().toISOString().split('T')[0], discount_percent: '', discount_amount: '', further_tax_percent: '', withholding_tax_percent: '', notes: '' })
  const [lines, setLines] = useState<Array<typeof emptyLine>>([{ ...emptyLine }])
  const [itemsOpt, setItemsOpt] = useState<Array<{ value: string | number; label: string }>>([])
  const [projects, setProjects] = useState<Array<{ value: string | number; label: string }>>([])
  const [selProjectMaterials, setSelProjectMaterials] = useState<Array<any>>([])

  // View / Print
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewData, setViewData] = useState<any>(null)

  // Void
  const [voidTarget, setVoidTarget] = useState<SalesInvoiceRow | null>(null)
  const [voidReason, setVoidReason] = useState('')

  // Payment
  const [payTarget, setPayTarget] = useState<SalesInvoiceRow | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', bank_account_id: '' as string | number, reference_no: '', notes: '', wht_deducted: '' })

  // Receipts
  const [receipts, setReceipts] = useState<any[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)

  // Summary
  const [summary, setSummary] = useState({ total_invoiced: 0, total_outstanding: 0 })

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.sales.list(user.id, {
        ...(filters.payment_status ? { payment_status: filters.payment_status } : {}),
        ...(filters.date_from ? { date_from: filters.date_from } : {}),
        ...(filters.date_to ? { date_to: filters.date_to } : {}),
        ...(filters.customer_id ? { customer_id: Number(filters.customer_id) } : {}),
        ...(filters.project_id ? { project_id: Number(filters.project_id) } : {}),
      })
      setItems(list)
      const totalInv = list.reduce((s: number, i: any) => s + i.grand_total, 0)
      const totalOut = list.reduce((s: number, i: any) => s + i.balance_due, 0)
      setSummary({ total_invoiced: totalInv, total_outstanding: totalOut })
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load invoices' }) }
    finally { setLoading(false) }
  }, [user, filters, addToast])

  const loadReceipts = useCallback(async () => {
    if (!user) return
    setReceiptsLoading(true)
    try { setReceipts(await api.receipts.list(user.id)) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load receipts' }) }
    finally { setReceiptsLoading(false) }
  }, [user, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const [c, i, allProjects] = await Promise.all([
        api.customers.list(user.id, { isActive: true }),
        api.inventory.listItems(user.id),
        api.projects.list(user.id),
      ])
      setCustomers(c.map((x) => ({ value: x.id, label: `${x.name}${x.company_name ? ` (${x.company_name})` : ''}` })))
      setItemsOpt(i.map((x) => ({ value: x.id, label: `${x.item_code ?? ''} - ${x.name}` })))
      setFilterProjects(allProjects.map((p) => ({ value: p.id, label: `${p.project_name}${p.project_code ? ` (${p.project_code})` : ''}` })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])
  useEffect(() => { loadReceipts() }, [])
  useEffect(() => { if (activeTab === 'receipts') loadReceipts() }, [activeTab, loadReceipts])

  // Auto-calculations
  const calc = (() => {
    const defaultGst = Number(settings.default_gst_percent || 18)

    let lineSubtotal = 0
    const lineDetails = lines.map((l) => {
      const qty = Number(l.quantity) || 0; const rate = Number(l.rate) || 0
      const amt = round2(qty * rate)
      const gstPct = Number(l.gst_percent) || defaultGst
      const gstAmt = round2(amt * gstPct / 100)
      lineSubtotal += amt
      return { qty, rate, amt, gstPct, gstAmt }
    })
    lineSubtotal = round2(lineSubtotal)

    const discPct = Number(header.discount_percent) || 0
    const discFlat = Number(header.discount_amount) || 0
    const discAmount = discFlat > 0 ? discFlat : round2(lineSubtotal * discPct / 100)
    const totalBeforeTax = round2(lineSubtotal - discAmount)
    const gstTotal = lineDetails.reduce((s, li) => s + li.gstAmt, 0)

    // Check if customer has STRN for further tax suggestion
    const ftPct = Number(header.further_tax_percent) || 0
    const ftAmount = round2(totalBeforeTax * ftPct / 100)
    const totalTax = round2(gstTotal + ftAmount)
    const grandTotal = round2(totalBeforeTax + totalTax)
    const whtPct = Number(header.withholding_tax_percent) || 0
    const whtAmount = round2(totalBeforeTax * whtPct / 100)

    return { lineSubtotal, discAmount, totalBeforeTax, gstTotal, ftPct, ftAmount, totalTax, grandTotal, whtPct, whtAmount }
  })()

  const onCustomerChange = async (custId: string | number) => {
    setHeader({ ...header, customer_id: custId, further_tax_percent: '' })
    if (!user || !custId) return
    try {
      // Check STRN
      const c = await api.customers.get(user.id, Number(custId))
      if (c) {
        // If no STRN, suggest further tax 3%
        if (!c.strn || c.strn.trim() === '') {
          setHeader((h) => ({ ...h, customer_id: custId, further_tax_percent: '3' }))
        }
      }
      // Load projects for this customer
      const projs = await api.projects.list(user.id, { customer_id: Number(custId) })
      setProjects(projs.map((p) => ({ value: p.id, label: `${p.project_name} (${p.project_code})` })))
    } catch { /* ignore */ }
  }

  const addFromProjectMaterials = async () => {
    if (!header.project_id || !user) return
    try {
      const mats = await api.sales.projectMaterials(user.id, Number(header.project_id))
      setSelProjectMaterials(mats)
      const newLines = mats.map((m: any) => ({
        item_id: m.item_id,
        description: m.item_name,
        quantity: String(m.quantity_issued),
        unit: m.unit_short_code ?? '',
        rate: '', // user fills sale price
        gst_percent: String(Number(settings.default_gst_percent || 18)),
      }))
      setLines(newLines.length > 0 ? newLines : [{ ...emptyLine }])
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load project materials' }) }
  }

  const handleCreate = async () => {
    if (!user) return
    if (!header.customer_id || !header.date) {
      addToast({ type: 'warning', title: 'Validation', message: 'Customer and date are required' })
      return
    }
    const itemsData = lines.filter((l) => l.description && l.quantity && l.rate).map((l) => ({
      item_id: l.item_id ? Number(l.item_id) : undefined,
      description: l.description,
      quantity: Number(l.quantity) || 0,
      unit: l.unit || undefined,
      rate: Number(l.rate) || 0,
      gst_percent: Number(l.gst_percent) || Number(settings.default_gst_percent || 18),
    }))
    if (itemsData.length === 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Add at least one line item' })
      return
    }
    try {
      const r = await api.sales.create(user.id, {
        customer_id: Number(header.customer_id),
        project_id: header.project_id ? Number(header.project_id) : undefined,
        date: header.date,
        discount_percent: Number(header.discount_percent) || 0,
        discount_amount: Number(header.discount_amount) || 0,
        further_tax_percent: Number(calc.ftPct) || 0,
        withholding_tax_percent: Number(header.withholding_tax_percent) || 0,
        notes: header.notes || undefined,
        items: itemsData,
      })
      addToast({ type: 'success', title: 'Created', message: `Invoice ${r.invoice_number} created (${formatCurrency(r.grand_total)})` })
      setShowNew(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const viewInvoice = async (id: number) => {
    setViewId(id)
    try {
      const d = await api.sales.getById(user!.id, id)
      setViewData(d)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load invoice' }) }
  }

  const handleVoid = async () => {
    if (!user || !voidTarget || !voidReason.trim()) {
      addToast({ type: 'warning', title: 'Validation', message: 'Void reason is required' })
      return
    }
    try {
      await api.sales.void(user.id, voidTarget.id, voidReason)
      addToast({ type: 'success', title: 'Voided', message: 'Invoice voided' })
      setVoidTarget(null); setVoidReason(''); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handlePayment = async () => {
    if (!user || !payTarget) return
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      addToast({ type: 'warning', title: 'Validation', message: 'Valid amount is required' })
      return
    }
    try {
      const r = await api.receipts.record(user.id, {
        customer_id: payTarget.customer_id,
        sales_invoice_id: payTarget.id,
        date: payForm.date,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        bank_account_id: payForm.bank_account_id ? Number(payForm.bank_account_id) : undefined,
        reference_no: payForm.reference_no || undefined,
        notes: payForm.notes || undefined,
        withholding_tax_deducted: Number(payForm.wht_deducted) || 0,
      })
      addToast({ type: 'success', title: 'Payment Recorded', message: `Receipt ${r.receipt_number} recorded` })
      setPayTarget(null); load(); loadReceipts()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const addLine = () => setLines([...lines, { ...emptyLine }])
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i))
  const updLine = (i: number, f: string, v: string | number) => {
    const n = [...lines]; n[i] = { ...n[i], [f]: v }; setLines(n)
  }

  const printInvoice = () => {
    if (!viewData) return
    const doc = mapSalesInvoiceToDocument(viewData, settings)
    openDocumentPrintWindow(buildDocumentPrintHtml(doc), `Invoice ${viewData.invoice_number}`)
  }

  const defaultGst = Number(settings.default_gst_percent || 18)
  const netExpected = calc.grandTotal - calc.whtAmount
  const receiptTotalAmt = items.reduce((s: number, i: any) => s + i.balance_due, 0)

  return (
    <div>
      <PageHeader title="Sales Invoices" subtitle="Bill customers and track payments with Pakistani tax compliance" />

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${activeTab === 'invoices' ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500'}`}>
            <List size={18} /> Sales Invoices
          </button>
          <button onClick={() => setActiveTab('receipts')}
            className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${activeTab === 'receipts' ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500'}`}>
            <ReceiptIcon size={18} /> Customer Receipts
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'invoices' && (
          <div>
            {/* Summary + Filters */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="card p-3"><p className="text-xs text-gray-500">Total Invoiced</p><p className="text-lg font-bold">{formatCurrency(summary.total_invoiced)}</p></div>
              <div className="card p-3"><p className="text-xs text-gray-500">Total Outstanding</p><p className="text-lg font-bold text-orange-600">{formatCurrency(summary.total_outstanding)}</p></div>
              <div className="card p-3"><p className="text-xs text-gray-500">Invoices</p><p className="text-lg font-bold">{items.length}</p></div>
            </div>
            <div className="mb-4 space-y-2">
              {/* Filter row */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                  <Filter size={13} /> Filters:
                </div>
                <SearchableSelect
                  className="w-56"
                  options={customers}
                  value={filters.customer_id}
                  onChange={(v) => {
                    // Reset project filter when customer changes
                    setFilters({ ...filters, customer_id: v, project_id: '' })
                  }}
                  placeholder="All Customers"
                />
                <SearchableSelect
                  className="w-52"
                  options={filterProjects}
                  value={filters.project_id}
                  onChange={(v) => setFilters({ ...filters, project_id: v })}
                  placeholder="All Projects"
                />
                <select value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })} className="input-field w-36 text-sm">
                  <option value="">All Status</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
                <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="input-field text-sm w-36" placeholder="From" />
                <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="input-field text-sm w-36" placeholder="To" />
                {(filters.customer_id || filters.project_id || filters.payment_status || filters.date_from || filters.date_to) && (
                  <button
                    onClick={() => setFilters({ payment_status: '', date_from: '', date_to: '', customer_id: '', project_id: '' })}
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-500 border border-gray-200"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
                <div className="ml-auto">
                  <button onClick={() => { setHeader({ ...header, date: new Date().toISOString().split('T')[0] }); setLines([{ ...emptyLine, gst_percent: String(defaultGst) }]); setSelProjectMaterials([]); setShowNew(true) }} className="btn-primary gap-2"><Plus size={16} /> New Invoice</button>
                </div>
              </div>
            </div>

            <DataTable
              data={items}
              columns={[
                { key: 'invoice_number', header: 'Invoice #', render: (r) => <span className="font-mono text-xs font-medium">{r.invoice_number}</span> },
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'customer_name', header: 'Customer' },
                { key: 'project_name', header: 'Project', render: (r) => r.project_name ?? '-' },
                { key: 'grand_total', header: 'Total', render: (r) => formatCurrency(r.grand_total) },
                { key: 'amount_received', header: 'Received', render: (r) => formatCurrency(r.amount_received) },
                { key: 'balance_due', header: 'Balance', render: (r) => <span className="font-medium">{formatCurrency(r.balance_due)}</span> },
                { key: 'payment_status', header: 'Status', render: (r) => <StatusBadge status={r.payment_status} /> },
                { key: 'id', header: 'Actions', render: (r) => (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => viewInvoice(r.id)} className="rounded p-1 text-gray-400 hover:text-gray-600" title="View/Print"><Eye size={14} /></button>
                    {r.payment_status !== 'paid' && (
                      <button onClick={() => { setPayTarget(r); setPayForm({ amount: String(r.balance_due), date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', bank_account_id: '', reference_no: '', notes: '', wht_deducted: '' }) }} className="rounded p-1 text-green-600 hover:text-green-700" title="Record Payment"><DollarSign size={14} /></button>
                    )}
                    {r.amount_received === 0 && (
                      <button onClick={() => { setVoidTarget(r); setVoidReason('') }} className="rounded p-1 text-red-500 hover:text-red-700" title="Void"><Ban size={14} /></button>
                    )}
                  </div>
                )},
              ]}
            />

            {/* New Invoice Drawer */}
            <div className={`fixed inset-0 z-40 flex justify-end ${showNew ? '' : 'hidden'}`}>
              <div className="bg-black/30 flex-1" onClick={() => setShowNew(false)} />
              <div className="w-full max-w-4xl overflow-y-auto bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                  <h3 className="text-lg font-semibold text-gray-900">New Sales Invoice</h3>
                  <button onClick={() => setShowNew(false)} className="rounded p-1 text-gray-400"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <SearchableSelect label="Customer *" options={customers} value={header.customer_id} onChange={onCustomerChange} placeholder="Select customer" />
                    <SearchableSelect label="Linked Project" options={projects} value={header.project_id} onChange={(v) => setHeader({ ...header, project_id: v })} placeholder="Optional project" />
                    <div><label className="label-text mb-1">Date *</label><input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} className="input-field" /></div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Line Items</span>
                      <div className="flex gap-2">
                        {header.project_id && <button onClick={addFromProjectMaterials} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> From Project Materials</button>}
                        <button onClick={addLine} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> Add Row</button>
                      </div>
                    </div>
                    <table className="min-w-full text-sm">
                      <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1 pr-2 w-1/4">Item/Description</th><th className="py-1 pr-2 w-12">Qty</th><th className="py-1 pr-2 w-12">Unit</th><th className="py-1 pr-2 w-20">Rate</th><th className="py-1 pr-2 w-20">Amount</th><th className="py-1 pr-2 w-12">GST%</th><th className="py-1 pr-2 w-20">GST Amt</th><th className="w-6"></th></tr></thead>
                      <tbody>
                        {lines.map((l, i) => {
                          const qty = Number(l.quantity) || 0; const rate = Number(l.rate) || 0
                          const amt = round2(qty * rate); const gpct = Number(l.gst_percent) || defaultGst
                          const gstA = round2(amt * gpct / 100)
                          return (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="py-1 pr-2">
                                <div className="flex gap-1 items-center">
                                  <SearchableSelect options={itemsOpt} value={l.item_id} onChange={(v) => updLine(i, 'item_id', v)} placeholder="Item" />
                                  <span className="text-gray-300">or</span>
                                  <input value={l.description} onChange={(e) => updLine(i, 'description', e.target.value)} className="input-field text-xs flex-1" placeholder="Free text" />
                                </div>
                              </td>
                              <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => updLine(i, 'quantity', e.target.value)} className="input-field text-xs w-full" /></td>
                              <td className="py-1 pr-2"><input value={l.unit} onChange={(e) => updLine(i, 'unit', e.target.value)} className="input-field text-xs w-full" /></td>
                              <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => updLine(i, 'rate', e.target.value)} className="input-field text-xs w-full" /></td>
                              <td className="py-1 pr-2 text-right text-xs text-gray-600">{formatCurrency(amt)}</td>
                              <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.gst_percent} onChange={(e) => updLine(i, 'gst_percent', e.target.value)} className="input-field text-xs w-full" /></td>
                              <td className="py-1 pr-2 text-right text-xs text-gray-600">{formatCurrency(gstA)}</td>
                              <td className="py-1">{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t pt-4">
                    <div className="grid gap-4 md:grid-cols-5">
                      <div><label className="label-text mb-1 text-xs">Discount %</label><input type="number" step="0.01" min="0" value={header.discount_percent} onChange={(e) => setHeader({ ...header, discount_percent: e.target.value, discount_amount: '' })} className="input-field text-sm" /></div>
                      <div><label className="label-text mb-1 text-xs">Discount Flat</label><input type="number" step="0.01" min="0" value={header.discount_amount} onChange={(e) => setHeader({ ...header, discount_amount: e.target.value, discount_percent: '' })} className="input-field text-sm" /></div>
                      <div><label className="label-text mb-1 text-xs">Further Tax %</label><input type="number" step="0.01" min="0" value={header.further_tax_percent} onChange={(e) => setHeader({ ...header, further_tax_percent: e.target.value })} className="input-field text-sm" /></div>
                      <div><label className="label-text mb-1 text-xs">WHT %</label><input type="number" step="0.01" min="0" value={header.withholding_tax_percent} onChange={(e) => setHeader({ ...header, withholding_tax_percent: e.target.value })} className="input-field text-sm" /></div>
                      <div><label className="label-text mb-1 text-xs">Notes</label><input value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} className="input-field text-sm" /></div>
                    </div>
                    <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                      <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(calc.lineSubtotal)}</span></div>
                      {calc.discAmount > 0 && <div className="flex justify-between"><span>Discount:</span><span className="text-red-600">-{formatCurrency(calc.discAmount)}</span></div>}
                      <div className="flex justify-between font-medium"><span>Total Before Tax:</span><span>{formatCurrency(calc.totalBeforeTax)}</span></div>
                      <div className="flex justify-between"><span>GST:</span><span>{formatCurrency(calc.gstTotal)}</span></div>
                      {calc.ftAmount > 0 && <div className="flex justify-between"><span>Further Tax ({calc.ftPct}%):</span><span>{formatCurrency(calc.ftAmount)}</span></div>}
                      <div className="flex justify-between font-bold border-t pt-1 text-base"><span>Grand Total:</span><span>{formatCurrency(calc.grandTotal)}</span></div>
                      {calc.whtAmount > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Customer may withhold income tax ({calc.whtPct}%):</span><span>-{formatCurrency(calc.whtAmount)}</span></div>}
                      {calc.whtAmount > 0 && <div className="flex justify-between text-xs text-blue-600"><span>Net amount expected:</span><span>{formatCurrency(netExpected)}</span></div>}
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
                      <button onClick={handleCreate} className="btn-primary">Create Invoice</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* View/Print Modal */}
            <div className={`fixed inset-0 z-40 flex justify-end ${viewData ? '' : 'hidden'}`}>
              <div className="bg-black/30 flex-1" onClick={() => { setViewId(null); setViewData(null) }} />
              <div className="w-full max-w-2xl overflow-y-auto bg-white shadow-xl" ref={printRef}>
                {viewData && (
                  <>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                      <h3 className="text-lg font-semibold text-gray-900">{viewData.invoice_number}</h3>
                      <div className="flex gap-2">
                        <button onClick={printInvoice} className="btn-primary gap-2 !py-1.5 !px-3 text-sm"><Printer size={14} /> Print</button>
                        <button onClick={() => { setViewId(null); setViewData(null) }} className="rounded p-1 text-gray-400"><X size={20} /></button>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      {/* Invoice content for print preview */}
                      <div className="text-center border-b pb-4">
                        <h3 className="text-xl font-bold">{settings.company_name || 'TAX INVOICE'}</h3>
                        <p className="text-xs text-gray-500">{settings.company_address}</p>
                        <p className="text-xs text-gray-500">NTN: {settings.company_ntn || '-'} | STRN: {settings.company_strn || '-'}</p>
                        <h4 className="mt-2 font-semibold">TAX INVOICE</h4>
                        <p className="text-sm font-mono">{viewData.invoice_number} | Date: {formatDate(viewData.date)}</p>
                      </div>
                      <div>
                        <h5 className="text-sm font-semibold text-gray-700">Bill To</h5>
                        <p className="text-sm">{viewData.customer_name}<br />{viewData.customer_address || ''}</p>
                        <p className="text-xs text-gray-500">NTN: {viewData.customer_ntn || '-'} | STRN: {viewData.customer_strn || '-'}</p>
                      </div>
                      <table className="min-w-full text-xs">
                        <thead><tr className="border-b"><th className="py-1 pr-2 text-left">#</th><th className="py-1 pr-2 text-left">Description</th><th className="py-1 pr-2 text-right">Qty</th><th className="py-1 pr-2 text-right">Rate</th><th className="py-1 pr-2 text-right">Amount</th><th className="py-1 pr-2 text-right">GST%</th><th className="py-1 text-right">GST Amt</th></tr></thead>
                        <tbody>
                          {(viewData.items || []).map((li: any, i: number) => (
                            <tr key={li.id} className="border-b border-gray-50">
                              <td className="py-1 pr-2">{i + 1}</td>
                              <td className="py-1 pr-2">{li.description}</td>
                              <td className="py-1 pr-2 text-right">{li.quantity}</td>
                              <td className="py-1 pr-2 text-right">{formatCurrency(li.rate)}</td>
                              <td className="py-1 pr-2 text-right">{formatCurrency(li.amount)}</td>
                              <td className="py-1 pr-2 text-right">{li.gst_percent}%</td>
                              <td className="py-1 text-right">{formatCurrency(li.gst_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end">
                        <div className="w-64 space-y-1 text-sm">
                          <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(viewData.subtotal)}</span></div>
                          {viewData.discount_amount > 0 && <div className="flex justify-between text-red-600"><span>Discount:</span><span>-{formatCurrency(viewData.discount_amount)}</span></div>}
                          <div className="flex justify-between font-medium border-t pt-1"><span>Total Before Tax:</span><span>{formatCurrency(viewData.total_before_tax)}</span></div>
                          <div className="flex justify-between"><span>GST:</span><span>{formatCurrency(viewData.gst_amount)}</span></div>
                          {viewData.further_tax_amount > 0 && <div className="flex justify-between"><span>Further Tax:</span><span>{formatCurrency(viewData.further_tax_amount)}</span></div>}
                          <div className="flex justify-between font-bold text-base border-t pt-1"><span>Grand Total:</span><span>{formatCurrency(viewData.grand_total)}</span></div>
                          {viewData.withholding_tax_amount > 0 && <div className="flex justify-between text-xs text-gray-500"><span>WHT ({viewData.withholding_tax_percent}%):</span><span>-{formatCurrency(viewData.withholding_tax_amount)}</span></div>}
                          <div className="text-xs text-gray-600 mt-2 italic">Amount in Words: {numberToWords(viewData.grand_total)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between mt-12 pt-4 border-t text-sm">
                        <div className="text-center border-t border-gray-400 pt-2 w-48">Prepared By</div>
                        <div className="text-center border-t border-gray-400 pt-2 w-48">Authorized Signatory</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Void */}
            <ConfirmDialog open={!!voidTarget} title="Void Invoice" message={`Void "${voidTarget?.invoice_number}"? This will reverse accounting entries.`} onConfirm={handleVoid} onCancel={() => { setVoidTarget(null); setVoidReason('') }} destructive confirmLabel="Void" extraContent={<div className="mt-3"><label className="label-text mb-1">Void Reason *</label><textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input-field" rows={2} /></div>} />

            {/* Payment modal */}
            <FormModal open={!!payTarget} title="Record Customer Receipt" onClose={() => setPayTarget(null)} onSubmit={handlePayment} submitLabel="Record">
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Date</label><input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Payment Method</label><select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="input-field"><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="online">Online</option></select></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Amount Received *</label><input type="number" step="0.01" min="0" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">WHT Deducted (if any)</label><input type="number" step="0.01" min="0" value={payForm.wht_deducted} onChange={(e) => setPayForm({ ...payForm, wht_deducted: e.target.value })} className="input-field" placeholder="0" /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Reference No.</label><input value={payForm.reference_no} onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Notes</label><input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" /></div>
              </div>
              {payTarget && (
                <p className="text-xs text-gray-500">
                  Invoice: {payTarget.invoice_number} | Balance: {formatCurrency(payTarget.balance_due)}
                  {Number(payForm.wht_deducted) > 0 && <span className="block text-blue-600">WHT deducted: {formatCurrency(Number(payForm.wht_deducted))} — net cash received: {formatCurrency((Number(payForm.amount) || 0) - Number(payForm.wht_deducted))}</span>}
                </p>
              )}
            </FormModal>
          </div>
        )}

        {/* Receipts tab */}
        {activeTab === 'receipts' && (
          <div>
            <div className="mb-4 text-sm text-gray-500">{receipts.length} receipt(s)</div>
            <DataTable
              data={receipts}
              columns={[
                { key: 'receipt_number', header: 'Receipt #', render: (r) => <span className="font-mono text-xs font-medium">{r.receipt_number}</span> },
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'customer_name', header: 'Customer' },
                { key: 'invoice_number', header: 'Invoice' },
                { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount) },
                { key: 'withholding_tax_deducted', header: 'WHT Deducted', render: (r) => r.withholding_tax_deducted > 0 ? formatCurrency(r.withholding_tax_deducted) : '-' },
                { key: 'payment_method', header: 'Method', render: (r) => r.payment_method.replace(/_/g, ' ') },
                { key: 'reference_no', header: 'Reference', render: (r) => r.reference_no ?? '-' },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
