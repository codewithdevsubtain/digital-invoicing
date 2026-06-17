import { useEffect, useState, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import type { VendorPaymentRow } from '../../lib/types.js'

export default function PaymentsTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [items, setItems] = useState<VendorPaymentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewData, setViewData] = useState<any>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.purchases.payment.list(user.id, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      setItems(list)
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load payments' })
    } finally { setLoading(false) }
  }, [user, dateFrom, dateTo, addToast])

  useEffect(() => { load() }, [load])

  const viewPayment = async (id: number) => {
    setViewId(id)
    try {
      const d = await api.purchases.payment.getById(user!.id, id)
      setViewData(d)
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load payment details' })
    }
  }

  const totalAmount = items.reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm w-36" placeholder="From" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm w-36" placeholder="To" />
          <span className="text-sm text-gray-500">{items.length} payment(s) | Total: {formatCurrency(totalAmount)}</span>
        </div>
      </div>

      <DataTable
        data={items}
        columns={[
          { key: 'payment_number', header: 'Payment #', render: (r) => <span className="font-mono text-xs font-medium">{r.payment_number}</span> },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
          { key: 'vendor_name', header: 'Vendor' },
          { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span> },
          { key: 'payment_method', header: 'Method', render: (r) => r.payment_method.replace(/_/g, ' ') },
          { key: 'reference_no', header: 'Reference', render: (r) => r.reference_no ?? '-' },
          { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '-' },
          { key: 'id', header: '', render: (r) => (
            <button onClick={(e) => { e.stopPropagation(); viewPayment(r.id) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Eye size={14} /></button>
          )},
        ]}
      />

      <FormModal open={!!viewData} title={viewData ? `Payment ${viewData.payment_number}` : ''} onClose={() => { setViewId(null); setViewData(null) }}>
        {viewData && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">Vendor:</span> <span className="font-medium">{viewData.vendor_name}</span></div>
              <div><span className="text-gray-500">Date:</span> <span>{formatDate(viewData.date)}</span></div>
              <div><span className="text-gray-500">Amount:</span> <span className="font-bold">{formatCurrency(viewData.amount)}</span></div>
              <div><span className="text-gray-500">Method:</span> <span>{viewData.payment_method.replace(/_/g, ' ')}</span></div>
              <div><span className="text-gray-500">Reference:</span> <span>{viewData.reference_no ?? '-'}</span></div>
              <div><span className="text-gray-500">Notes:</span> <span>{viewData.notes ?? '-'}</span></div>
            </div>
            {viewData.allocations && viewData.allocations.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Applied to Invoices</p>
                <table className="min-w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Invoice</th><th className="py-1">Amount</th></tr></thead>
                  <tbody>
                    {viewData.allocations.map((a: any) => (
                      <tr key={a.id} className="border-b border-gray-50">
                        <td className="py-1 pr-2 font-mono">{a.invoice_number}</td>
                        <td className="py-1 font-medium">{formatCurrency(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </FormModal>
    </div>
  )
}
