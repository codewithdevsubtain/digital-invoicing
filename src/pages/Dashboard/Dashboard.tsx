import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Users, CreditCard, Wallet, AlertTriangle, Landmark, TrendingUp, Activity } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { formatCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import type { LowStockItem } from '../../lib/types.js'

const statCards = [
  { key: 'receivables', label: 'Total Receivables', icon: Wallet, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  { key: 'overdue', label: 'Customers Overdue', icon: Users, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
  { key: 'payables', label: 'Total Payables', icon: CreditCard, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  { key: 'vendors', label: 'Vendors with Balance', icon: Users, iconBg: 'bg-navy-50', iconColor: 'text-navy-800' },
  { key: 'cash', label: 'Cash Position', icon: Landmark, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'projects', label: 'Active Projects', icon: Factory, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
] as const

function projectStatusBadge(status: string): string {
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700'
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

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

  const statValues: Record<(typeof statCards)[number]['key'], string> = {
    receivables: formatCurrency(receivables),
    overdue: String(overdueCustomers),
    payables: formatCurrency(payables),
    vendors: String(vendorCount),
    cash: formatCurrency(cashBalance),
    projects: String(activeProjectList.length),
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Overview of your HVAC ERP" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map(({ key, label, icon: Icon, iconBg, iconColor }) => (
          <div key={key} className="card flex min-h-[5.5rem] items-center gap-4 !p-5">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-gray-900">{statValues[key]}</p>
            </div>
          </div>
        ))}
      </div>

      {lowStockItems.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <AlertTriangle size={18} className="text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-900">Low Stock Alerts</h3>
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              {lowStockItems.length} item(s)
            </span>
          </div>
          <div className="overflow-x-auto px-5 py-3">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Current Stock</th>
                  <th className="pb-2 pr-4">Reorder Level</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lowStockItems.slice(0, 10).map((item) => {
                  const ratio = item.reorder_level > 0 ? item.current_stock / item.reorder_level : 1
                  const critical = ratio < 0.25
                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{item.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{item.item_code ?? '-'}</td>
                      <td className="py-2.5 pr-4 capitalize text-gray-600">{item.item_type.replace('_', ' ')}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`font-semibold ${critical ? 'text-red-600' : 'text-orange-600'}`}>
                          {item.current_stock} {item.unit_short_code ?? ''}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">{item.reorder_level}</td>
                      <td className="py-2.5">
                        {critical ? (
                          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Critical</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Low</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {lowStockItems.length > 10 && (
              <p className="mt-2 text-center text-xs text-gray-400">
                + {lowStockItems.length - 10} more items below reorder level
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Factory size={16} className="text-amber-600" />
              Active Projects ({activeProjectList.length})
            </h3>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="text-xs font-medium text-navy-600 hover:text-navy-800"
            >
              View All
            </button>
          </div>
          <div className="px-2 py-2">
            {activeProjectList.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {activeProjectList.slice(0, 8).map((p: any) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-gray-50"
                  >
                    <span className="truncate font-medium text-gray-900">{p.project_name}</span>
                    <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${projectStatusBadge(p.status)}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">No active projects</p>
            )}
          </div>
        </div>

        <div className="card !p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TrendingUp size={16} className="text-emerald-600" />
              Top Projects by Profit
            </h3>
          </div>
          <div className="px-2 py-2">
            {dashData?.top_projects?.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {dashData.top_projects.slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-gray-50"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium text-gray-900">{p.project_name}</p>
                      <p className="text-xs text-gray-400">{p.project_code}</p>
                    </div>
                    <span className={`shrink-0 font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(p.profit)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">No project data yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Activity size={16} className="text-navy-700" />
            Recent Activity
          </h3>
        </div>
        <div className="max-h-48 overflow-y-auto scrollbar-main px-5 py-2">
          {recentActivity.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {recentActivity.slice(0, 15).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 py-2.5 text-xs">
                  <span className="w-28 shrink-0 text-gray-400">
                    {new Date(a.timestamp).toLocaleDateString('en-PK', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="w-20 shrink-0 truncate text-gray-500">{a.user_name ?? 'System'}</span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{a.module}</span>
                  <span className="min-w-0 flex-1 text-gray-700">{a.details}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  )
}
