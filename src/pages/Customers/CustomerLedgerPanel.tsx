import { useEffect, useState } from 'react'
import { Printer, Download, Calendar } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import type { Customer, CustomerLedger, Project } from '../../lib/types.js'

type LedgerRow = CustomerLedger & { running_balance: number; reference_no?: string | null; project_name?: string | null }
type CustomerWithBalance = Customer & { current_balance: number }

interface CustomerLedgerPanelProps {
  customerId: number
  customer?: CustomerWithBalance | null
  showTitle?: boolean
}

export default function CustomerLedgerPanel({ customerId, customer: passedCustomer, showTitle = true }: CustomerLedgerPanelProps) {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(passedCustomer ?? null)
  const [entries, setEntries] = useState<LedgerRow[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (passedCustomer) setCustomer(passedCustomer)
  }, [passedCustomer])

  // Load projects for this customer
  useEffect(() => {
    if (!user || !customerId) return
    api.customers.projects(user.id, customerId)
      .then((p) => setProjects(p ?? []))
      .catch(() => {})
  }, [user, customerId])

  const load = async () => {
    if (!user || !customerId) return
    setLoading(true)
    try {
      const [c, ledger] = await Promise.all([
        passedCustomer ? Promise.resolve(passedCustomer) : api.customers.get(user.id, customerId),
        api.customers.ledger(user.id, customerId, {
          dateFrom,
          dateTo,
          ...(projectId ? { project_id: Number(projectId) } : {}),
        }),
      ])
      setCustomer(c)
      setEntries(ledger)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load ledger' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user, customerId, dateFrom, dateTo, projectId, passedCustomer])

  const exportCSV = () => {
    if (!customer) return
    const rows = [
      ['Date', 'Description', 'Reference', 'Project', 'Debit', 'Credit', 'Running Balance'],
      ...entries.map((e) => [
        e.date,
        e.description ?? '',
        e.reference_no ?? '',
        e.project_name ?? '',
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
    a.download = `customer-ledger-${customer.customer_code}-${customer.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printStatement = () => {
    if (!customer) return
    const selectedProject = projectId ? projects.find((p) => p.id === Number(projectId)) : null
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Statement - ${customer.name}</title>
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
        <h2>Customer Statement</h2>
        <div class="meta">
          <strong>${customer.name}</strong><br/>
          ${customer.company_name ? `Company: ${customer.company_name}<br/>` : ''}
          ${customer.contact_person ? `Contact: ${customer.contact_person}<br/>` : ''}
          ${customer.phone ? `Phone: ${customer.phone}<br/>` : ''}
          ${selectedProject ? `Project: ${selectedProject.project_name}<br/>` : ''}
          Current Balance: <strong>${formatCurrency(customer.current_balance)}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Project</th>
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
                <td>${e.project_name ?? ''}</td>
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
      {showTitle && customer && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{customer.name}</h3>
          <p className="text-sm text-gray-500">{customer.customer_code}</p>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-4">
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
        {projects.length > 0 && (
          <div>
            <label className="label-text mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
              className="input-field"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code ? `${p.project_code} - ` : ''}{p.project_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button onClick={() => { setDateFrom(''); setDateTo(''); setProjectId('') }} className="btn-secondary">
          Clear
        </button>
        <div className="flex-1" />
        <button onClick={printStatement} className="btn-secondary gap-2">
          <Printer size={16} />
          Print
        </button>
        <button onClick={exportCSV} className="btn-primary gap-2">
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Project</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    {loading ? 'Loading...' : 'No ledger entries found.'}
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatDate(e.date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.description ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{e.reference_no ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{e.project_name ?? '-'}</td>
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
    </div>
  )
}

