import { useEffect, useState } from 'react'
import { Factory, Users, CreditCard, Wallet, AlertTriangle, Package } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { formatCurrency } from '../../lib/format.js'
import type { LowStockItem } from '../../lib/types.js'

export default function Dashboard() {
  const { user } = useAuthStore()
  const [payables, setPayables] = useState(0)
  const [vendorCount, setVendorCount] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [overdueCustomers, setOverdueCustomers] = useState(0)
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [activeProjects, setActiveProjects] = useState(0)

  useEffect(() => {
    if (!user) return
    api.vendors.summary(user.id).then((s) => {
      setPayables(s.totalPayables)
      setVendorCount(s.outstandingCount)
    }).catch(() => {})
    api.customers.summary(user.id).then((s) => {
      setReceivables(s.totalReceivables)
      setOverdueCustomers(s.overdueCount)
    }).catch(() => {})
    api.inventory.getLowStockItems().then(setLowStockItems).catch(() => {})
    // Attempt to load active projects count (will fail silently if not implemented yet)
    api.projects.list().then((p: unknown) => {
      if (Array.isArray(p)) setActiveProjects(p.length)
    }).catch(() => {})
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
        <div className="card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Factory size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Active Projects</p>
            <p className="text-xl font-bold text-gray-900">{activeProjects}</p>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="mt-6">
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Low Stock Alerts</h3>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">{lowStockItems.length} item(s)</span>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Current Stock</th>
                  <th className="pb-2 pr-4">Reorder Level</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.slice(0, 10).map((item) => {
                  const ratio = item.reorder_level > 0 ? item.current_stock / item.reorder_level : 1
                  const critical = ratio < 0.25
                  return (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{item.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{item.item_code ?? '-'}</td>
                      <td className="py-2.5 pr-4 text-gray-600">{item.item_type.replace('_', ' ')}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`font-bold ${critical ? 'text-red-600' : 'text-orange-600'}`}>
                          {item.current_stock} {item.unit_short_code ?? ''}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">{item.reorder_level}</td>
                      <td className="py-2.5">
                        {critical ? (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Critical</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Low</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {lowStockItems.length > 10 && (
              <p className="mt-2 text-center text-xs text-gray-400">+ {lowStockItems.length - 10} more items below reorder level</p>
            )}
          </div>
        </div>
      )}

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
