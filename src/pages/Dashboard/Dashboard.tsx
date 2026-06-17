import { useEffect, useState } from 'react'
import { Factory, Users, CreditCard, Wallet } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { formatCurrency } from '../../lib/format.js'

export default function Dashboard() {
  const { user } = useAuthStore()
  const [payables, setPayables] = useState(0)
  const [vendorCount, setVendorCount] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [overdueCustomers, setOverdueCustomers] = useState(0)

  useEffect(() => {
    if (!user) return
    api.vendors.summary(user.id).then((s) => {
      setPayables(s.totalPayables)
      setVendorCount(s.outstandingCount)
    })
    api.customers.summary(user.id).then((s) => {
      setReceivables(s.totalReceivables)
      setOverdueCustomers(s.overdueCount)
    })
  }, [user])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500">Overview of your HVAC ERP</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Receivables</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(receivables)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Customers Overdue</p>
            <p className="text-xl font-bold text-gray-900">{overdueCustomers}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <CreditCard size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Payables</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(payables)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Vendors with Balance</p>
            <p className="text-xl font-bold text-gray-900">{vendorCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 opacity-60">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Factory size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Active Projects</p>
            <p className="text-xl font-bold text-gray-900">0</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center rounded-xl bg-white py-24 text-center shadow-sm ring-1 ring-gray-200">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-navy-50 text-navy-800">
          <Factory size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">HVAC ERP</h2>
        <p className="mt-2 text-gray-500">More dashboard modules will be added as they are built.</p>
      </div>
    </div>
  )
}
