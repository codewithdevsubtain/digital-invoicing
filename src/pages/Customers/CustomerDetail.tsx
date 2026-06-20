import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, User, BookOpen, FolderKanban } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import CustomerLedgerPanel from './CustomerLedgerPanel.js'
import type { Customer, Project } from '../../lib/types.js'

type CustomerWithBalance = Customer & { current_balance: number }

const tabs = [
  { key: 'profile', label: 'Profile Info', icon: User },
  { key: 'ledger', label: 'Ledger', icon: BookOpen },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
] as const

type TabKey = (typeof tabs)[number]['key']

const statusClasses: Record<string, string> = {
  quotation: 'text-gray-600',
  approved: 'text-blue-600',
  in_progress: 'text-amber-600',
  completed: 'text-green-600',
  on_hold: 'text-red-600',
  cancelled: 'text-gray-400',
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)

  const customerId = Number(id)
  const invalidId = !id || Number.isNaN(customerId)
  const activeTab = (searchParams.get('tab') as TabKey) || 'profile'

  const load = async () => {
    if (!user || !customerId) return
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        api.customers.get(user.id, customerId),
        api.customers.projects(user.id, customerId),
      ])
      setCustomer(c)
      setProjects(p)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load customer details' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (invalidId) return
    load()
  }, [user, customerId, invalidId])

  if (invalidId) {
    return (
      <div className="p-6 text-gray-500">Customer not found.</div>
    )
  }

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab })
  }

  const detailItem = (label: string, value: string | number | null) => (
    <div className="card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-base font-medium text-navy-900">{value ?? '-'}</p>
    </div>
  )

  return (
    <div>
      <PageHeader title="Customer Details" subtitle={customer?.name ?? 'Loading...'}>
        <button onClick={() => navigate('/customers')} className="btn-secondary gap-2">
          <ArrowLeft size={16} />
          Back to Customers
        </button>
      </PageHeader>

      {customer && (
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="card">
            <p className="text-sm text-gray-500">Customer Code</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{customer.customer_code}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Company</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{customer.company_name || '-'}</p>
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

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-navy-600 text-navy-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-6">
        {loading && !customer ? (
          <p className="text-sm text-gray-500">Loading customer details...</p>
        ) : !customer ? (
          <p className="text-sm text-gray-500">Customer not found.</p>
        ) : activeTab === 'profile' ? (
          <div className="grid gap-4 md:grid-cols-3">
            {detailItem('Full Name', customer.name)}
            {detailItem('Company Name', customer.company_name)}
            {detailItem('Contact Person', customer.contact_person)}
            {detailItem('Phone', customer.phone)}
            {detailItem('Email', customer.email)}
            {detailItem('NTN', customer.ntn)}
            {detailItem('STRN', customer.strn)}
            {detailItem('Opening Balance', formatCurrency(customer.opening_balance))}
            {detailItem('Opening Balance Type', customer.opening_balance_type)}
            {detailItem('Status', customer.is_active ? 'Active' : 'Inactive')}
            <div className="card md:col-span-3">
              <p className="text-sm text-gray-500">Address</p>
              <p className="mt-1 text-base font-medium text-navy-900">{customer.address || '-'}</p>
            </div>
          </div>
        ) : activeTab === 'ledger' ? (
          <CustomerLedgerPanel customerId={customerId} customer={customer} showTitle={false} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Project Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Project Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Contract Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      No projects linked to this customer.
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{p.project_code ?? '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.project_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className={`text-xs font-medium uppercase ${statusClasses[p.status] ?? 'text-gray-600'}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                        {formatCurrency(p.contract_value)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <Link to={`/projects/${p.id}`} className="text-blue-600 hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
