import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Download, Calendar } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import type { Vendor, VendorLedger } from '../../lib/types.js'

type LedgerRow = VendorLedger & { running_balance: number; reference_no?: string | null }
type VendorWithBalance = Vendor & { current_balance: number }

export default function VendorLedger() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [vendor, setVendor] = useState<VendorWithBalance | null>(null)
  const [entries, setEntries] = useState<LedgerRow[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)

  const vendorId = Number(id)
  const invalidId = !id || Number.isNaN(vendorId)

  const load = async () => {
    if (!user || invalidId) return
    setLoading(true)
    try {
      const [v, ledger] = await Promise.all([
        api.vendors.get(user.id, vendorId),
        api.vendors.ledger(user.id, vendorId, { dateFrom, dateTo }),
      ])
      setVendor(v)
      setEntries(ledger)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load ledger' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (invalidId) return
    load()
  }, [user, vendorId, dateFrom, dateTo, invalidId])

  if (invalidId) {
    return <div className="p-6 text-gray-500">Vendor not found.</div>
  }

  const exportCSV = () => {
    if (!vendor) return
    const rows = [
      ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Running Balance'],
      ...entries.map((e) => [
        e.date,
        e.description ?? '',
        e.reference_no ?? '',
        String(e.debit),
        String(e.credit),
        String(e.running_balance),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-ledger-${vendor.vendor_code}-${vendor.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printStatement = () => {
    if (!vendor) return
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vendor Statement - ${vendor.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h2 { margin: 0 0 4px; }
          .meta { color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <h2>Vendor Statement</h2>
        <div class="meta">
          <strong>${vendor.name}</strong><br/>
          ${vendor.contact_person ? `Contact: ${vendor.contact_person}<br/>` : ''}
          ${vendor.phone ? `Phone: ${vendor.phone}<br/>` : ''}
          Current Balance: <strong>${formatCurrency(vendor.current_balance)}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Reference</th>
              <th class="right">Debit</th>
              <th class="right">Credit</th>
              <th class="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                (e) => `
              <tr>
                <td>${formatDate(e.date)}</td>
                <td>${e.description ?? ''}</td>
                <td>${e.reference_no ?? ''}</td>
                <td class="right">${e.debit ? formatCurrency(e.debit) : ''}</td>
                <td class="right">${e.credit ? formatCurrency(e.credit) : ''}</td>
                <td class="right">${formatCurrency(e.running_balance)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 250)
    }
  }

  return (
    <div>
      <PageHeader title="Vendor Ledger" subtitle={vendor?.name ?? 'Loading...'}>
        <div className="flex gap-2">
          <button onClick={() => navigate(-1)} className="btn-secondary gap-2">
            <ArrowLeft size={16} />
            Back
          </button>
          <button onClick={printStatement} className="btn-secondary gap-2">
            <Printer size={16} />
            Print
          </button>
          <button onClick={exportCSV} className="btn-primary gap-2">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </PageHeader>

      {vendor && (
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="card">
            <p className="text-sm text-gray-500">Vendor Code</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{vendor.vendor_code}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Contact</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{vendor.contact_person || '-'}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Phone</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{vendor.phone || '-'}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Current Balance</p>
            <p className={`mt-1 text-lg font-semibold ${vendor.current_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(vendor.current_balance)}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 card flex items-end gap-4">
        <div>
          <label className="label-text mb-1 flex items-center gap-1">
            <Calendar size={14} /> From
          </label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label-text mb-1 flex items-center gap-1">
            <Calendar size={14} /> To
          </label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo('') }} className="btn-secondary">
          Clear
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Reference</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Credit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  {loading ? 'Loading...' : 'No ledger entries found.'}
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{e.description ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{e.reference_no ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                    {e.debit ? formatCurrency(e.debit) : '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                    {e.credit ? formatCurrency(e.credit) : '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(e.running_balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
