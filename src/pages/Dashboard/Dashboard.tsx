import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Users, CreditCard, Wallet, AlertTriangle, Landmark, TrendingUp, Activity } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { formatCurrency } from '../../lib/format.js'
import type { LowStockItem } from '../../lib/types.js'

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [payables, setPayables] = useState(0)
  const [vendorCount, setVendorCount] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [overdueCustomers, setOverdueCustomers] = useState(0)
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [cashBalance, setCashBalance] = useState(0)
  const [dashData, setDashData] = useState<any>(null)
  const [activeProjectList, setActiveProjectList] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])

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
    api.cashbank.balances().then((b) => setCashBalance(b.total_cash_position)).catch(() => {})
    api.reports.dashboard(user.id).then((d) => {
      setDashData(d)
      setActiveProjectList(d.active_projects ?? [])
      setRecentActivity(d.recent_activity ?? [])
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
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <Landmark size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Cash Position</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(cashBalance)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 opacity-60">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Factory size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Active Projects</p>
            <p className="text-xl font-bold text-gray-900">{activeProjectList.length}</p>
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

      {/* Active Projects + Top Projects + Recent Activity */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Factory size={16} /> Active Projects ({activeProjectList.length})</h3>
            <button onClick={() => navigate('/projects')} className="text-xs text-navy-600 hover:underline">View All</button>
          </div>
          <div className="space-y-2">
            {activeProjectList.slice(0, 8).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1" onClick={() => navigate(`/projects/${p.id}`)}>
                <span className="font-medium">{p.project_name}</span>
                <span className="text-xs rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">{p.status.replace('_', ' ')}</span>
              </div>
            ))}
            {activeProjectList.length === 0 && <p className="text-xs text-gray-400">No active projects</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><TrendingUp size={16} /> Top Projects by Profit</h3>
          {dashData?.top_projects?.length > 0 ? (
            <div className="space-y-2">
              {dashData.top_projects.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div>
                    <p className="font-medium">{p.project_name}</p>
                    <p className="text-xs text-gray-400">{p.project_code}</p>
                  </div>
                  <span className={`font-medium ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(p.profit)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-400">No project data yet</p>}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 card p-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Activity size={16} /> Recent Activity</h3>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {recentActivity.slice(0, 15).map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-400 w-32 shrink-0">{new Date(a.timestamp).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-gray-500 w-16 shrink-0">{a.user_name ?? 'System'}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{a.module}</span>
              <span className="text-gray-700">{a.details}</span>
            </div>
          ))}
          {recentActivity.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No recent activity</p>}
        </div>
      </div>
    </div>
  )
}