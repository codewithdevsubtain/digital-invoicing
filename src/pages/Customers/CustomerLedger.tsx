import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import CustomerLedgerPanel from './CustomerLedgerPanel.js'
import type { Customer } from '../../lib/types.js'

type CustomerWithBalance = Customer & { current_balance: number }

export default function CustomerLedger() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null)
  const [loading, setLoading] = useState(false)

  const customerId = Number(id)

  useEffect(() => {
    if (!user || !customerId) return
    setLoading(true)
    api.customers
      .get(user.id, customerId)
      .then(setCustomer)
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load customer' }))
      .finally(() => setLoading(false))
  }, [user, customerId])

  return (
    <div>
      <PageHeader title="Customer Ledger" subtitle={customer?.name ?? 'Loading...'}>
        <button onClick={() => navigate(-1)} className="btn-secondary gap-2">
          <ArrowLeft size={16} />
          Back
        </button>
      </PageHeader>

      {customer && (
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="card">
            <p className="text-sm text-gray-500">Customer Code</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{customer.customer_code}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Contact</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{customer.contact_person || '-'}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Phone</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{customer.phone || '-'}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Current Balance</p>
            <p className={`mt-1 text-lg font-semibold ${customer.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(customer.current_balance)}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading && !customer ? (
          <p className="text-sm text-gray-500">Loading customer...</p>
        ) : (
          <CustomerLedgerPanel customerId={customerId} customer={customer} showTitle={false} />
        )}
      </div>
    </div>
  )
}
