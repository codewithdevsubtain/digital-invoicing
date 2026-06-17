import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, BookOpen, FolderKanban, Power, PowerOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import type { Customer } from '../../lib/types.js'

type CustomerRow = Customer & { current_balance: number; active_projects_count: number }

const balanceOptions = [
  { value: 'debit', label: 'They Owe Us' },
  { value: 'credit', label: 'We Owe Them' },
]

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const emptyForm = {
  name: '',
  company_name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  ntn: '',
  strn: '',
  opening_balance: '',
  opening_balance_type: 'debit' as 'debit' | 'credit',
  is_active: 1,
}

export default function Customers() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [summary, setSummary] = useState({ totalReceivables: 0, overdueCount: 0 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CustomerRow | null>(null)
  const [toggleCustomer, setToggleCustomer] = useState<CustomerRow | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const isActive = statusFilter === 'all' ? null : statusFilter === 'active'
      const [list, sum] = await Promise.all([
        api.customers.list(user.id, { search, isActive }),
        api.customers.summary(user.id),
      ])
      setCustomers(list)
      setSummary(sum)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load customers' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user, search, statusFilter])

  const resetForm = () => setForm(emptyForm)

  const openAdd = () => {
    resetForm()
    setEditing(null)
    setShowModal(true)
  }

  const openEdit = (c: CustomerRow) => {
    setEditing(c)
    setForm({
      name: c.name,
      company_name: c.company_name ?? '',
      contact_person: c.contact_person ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      ntn: c.ntn ?? '',
      strn: c.strn ?? '',
      opening_balance: c.opening_balance === 0 ? '' : String(c.opening_balance),
      opening_balance_type: c.opening_balance_type,
      is_active: c.is_active,
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!user) return
    const payload = {
      ...form,
      opening_balance: form.opening_balance === '' ? 0 : Number(form.opening_balance),
    }
    try {
      if (editing) {
        await api.customers.update(user.id, editing.id, payload)
        addToast({ type: 'success', title: 'Updated', message: `${payload.name} updated` })
      } else {
        await api.customers.create(user.id, payload)
        addToast({ type: 'success', title: 'Created', message: `${payload.name} added as customer` })
      }
      setShowModal(false)
      resetForm()
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  const handleToggle = async () => {
    if (!user || !toggleCustomer) return
    try {
      await api.customers.toggleActive(user.id, toggleCustomer.id)
      addToast({
        type: 'success',
        title: 'Status updated',
        message: `${toggleCustomer.name} is now ${toggleCustomer.is_active ? 'inactive' : 'active'}`,
      })
      setToggleCustomer(null)
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Toggle failed' })
    }
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle="Manage clients and receivables">
        <button onClick={openAdd} className="btn-primary gap-2">
          <Plus size={18} />
          Add Customer
        </button>
      </PageHeader>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="card md:col-span-1">
          <p className="text-sm text-gray-500">Total Receivables</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(summary.totalReceivables)}</p>
        </div>
        <div className="card md:col-span-1">
          <p className="text-sm text-gray-500">Customers with Overdue</p>
          <p className="mt-1 text-2xl font-bold text-navy-800">{summary.overdueCount}</p>
        </div>
        <div className="card flex items-end gap-3 md:col-span-2">
          <div className="flex-1">
            <label className="label-text mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, company, code, or phone"
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="w-40">
            <label className="label-text mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="input-field"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <DataTable
          data={customers}
          columns={[
            { key: 'customer_code', header: 'Code' },
            {
              key: 'name',
              header: 'Name / Company',
              render: (c) => (
                <div>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {c.company_name && <div className="text-xs text-gray-500">{c.company_name}</div>}
                </div>
              ),
            },
            { key: 'contact_person', header: 'Contact Person' },
            { key: 'phone', header: 'Phone' },
            {
              key: 'current_balance',
              header: 'Outstanding Balance',
              render: (c) => (
                <span className={`font-medium ${c.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(c.current_balance)}
                </span>
              ),
            },
            { key: 'active_projects_count', header: 'Active Projects' },
            {
              key: 'is_active',
              header: 'Status',
              render: (c) => (
                <span className={`text-xs font-medium ${c.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              ),
            },
            {
              key: 'id',
              header: 'Actions',
              render: (c) => (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => navigate(`/customers/${c.id}/ledger`)}
                    className="rounded p-1 text-navy-600 hover:bg-navy-50"
                    title="View Ledger"
                  >
                    <BookOpen size={16} />
                  </button>
                  <button
                    onClick={() => navigate(`/customers/${c.id}?tab=projects`)}
                    className="rounded p-1 text-purple-600 hover:bg-purple-50"
                    title="View Projects"
                  >
                    <FolderKanban size={16} />
                  </button>
                  <button
                    onClick={() => setToggleCustomer(c)}
                    className={`rounded p-1 ${c.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                    title={c.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {c.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                </div>
              ),
            },
          ]}
        />
        {loading && customers.length === 0 && <p className="mt-4 text-sm text-gray-500">Loading customers...</p>}
      </div>

      <FormModal
        open={showModal}
        title={editing ? 'Edit Customer' : 'Add Customer'}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-text mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label-text mb-1">Company Name</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">Contact Person</label>
            <input
              type="text"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">NTN</label>
            <input
              type="text"
              value={form.ntn}
              onChange={(e) => setForm({ ...form, ntn: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">STRN</label>
            <input
              type="text"
              value={form.strn}
              onChange={(e) => setForm({ ...form, strn: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label-text mb-1">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">Opening Balance</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">Opening Balance Type</label>
            <select
              value={form.opening_balance_type}
              onChange={(e) => setForm({ ...form, opening_balance_type: e.target.value as 'debit' | 'credit' })}
              className="input-field"
            >
              {balanceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {editing && (
            <div className="md:col-span-2">
              <label className="label-text mb-1">Status</label>
              <select
                value={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}
                className="input-field"
              >
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
          )}
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!toggleCustomer}
        title={toggleCustomer?.is_active ? 'Deactivate Customer' : 'Activate Customer'}
        message={`Are you sure you want to ${toggleCustomer?.is_active ? 'deactivate' : 'activate'} ${toggleCustomer?.name}?`}
        onConfirm={handleToggle}
        onCancel={() => setToggleCustomer(null)}
        destructive={!!toggleCustomer?.is_active}
      />
    </div>
  )
}
