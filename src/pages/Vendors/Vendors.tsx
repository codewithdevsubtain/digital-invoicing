import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, BookOpen, Power, PowerOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import type { Vendor } from '../../lib/types.js'

type VendorRow = Vendor & { current_balance: number }

const balanceOptions = [
  { value: 'credit', label: 'We Owe Them' },
  { value: 'debit', label: 'They Owe Us' },
]

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const emptyForm = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  ntn: '',
  opening_balance: '',
  opening_balance_type: 'credit' as 'debit' | 'credit',
  is_active: 1,
}

export default function Vendors() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [summary, setSummary] = useState({ totalPayables: 0, outstandingCount: 0 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<VendorRow | null>(null)
  const [toggleVendor, setToggleVendor] = useState<VendorRow | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const isActive = statusFilter === 'all' ? null : statusFilter === 'active'
      const [list, sum] = await Promise.all([
        api.vendors.list(user.id, { search, isActive }),
        api.vendors.summary(user.id),
      ])
      setVendors(list)
      setSummary(sum)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load vendors' })
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

  const openEdit = (v: VendorRow) => {
    setEditing(v)
    setForm({
      name: v.name,
      contact_person: v.contact_person ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      address: v.address ?? '',
      ntn: v.ntn ?? '',
      opening_balance: v.opening_balance === 0 ? '' : String(v.opening_balance),
      opening_balance_type: v.opening_balance_type,
      is_active: v.is_active,
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
        await api.vendors.update(user.id, editing.id, payload)
        addToast({ type: 'success', title: 'Updated', message: `${payload.name} updated` })
      } else {
        await api.vendors.create(user.id, payload)
        addToast({ type: 'success', title: 'Created', message: `${payload.name} added as vendor` })
      }
      setShowModal(false)
      resetForm()
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  const handleToggle = async () => {
    if (!user || !toggleVendor) return
    try {
      await api.vendors.toggleActive(user.id, toggleVendor.id)
      addToast({
        type: 'success',
        title: 'Status updated',
        message: `${toggleVendor.name} is now ${toggleVendor.is_active ? 'inactive' : 'active'}`,
      })
      setToggleVendor(null)
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Toggle failed' })
    }
  }

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Manage suppliers and vendors">
        <button onClick={openAdd} className="btn-primary gap-2">
          <Plus size={18} />
          Add Vendor
        </button>
      </PageHeader>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="card md:col-span-1">
          <p className="text-sm text-gray-500">Total Payables</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(summary.totalPayables)}</p>
        </div>
        <div className="card md:col-span-1">
          <p className="text-sm text-gray-500">Vendors with Balance</p>
          <p className="mt-1 text-2xl font-bold text-navy-800">{summary.outstandingCount}</p>
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
                placeholder="Name, code, or phone"
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
          data={vendors}
          columns={[
            { key: 'vendor_code', header: 'Code' },
            { key: 'name', header: 'Name' },
            { key: 'contact_person', header: 'Contact Person' },
            { key: 'phone', header: 'Phone' },
            {
              key: 'current_balance',
              header: 'Current Balance',
              render: (v) => {
                const weOwe = v.current_balance < 0
                return (
                  <span className={`font-medium ${weOwe ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(v.current_balance)}
                  </span>
                )
              },
            },
            {
              key: 'is_active',
              header: 'Status',
              render: (v) => (
                <span className={`text-xs font-medium ${v.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {v.is_active ? 'Active' : 'Inactive'}
                </span>
              ),
            },
            {
              key: 'id',
              header: 'Actions',
              render: (v) => (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(v)} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => navigate(`/vendors/${v.id}/ledger`)}
                    className="rounded p-1 text-navy-600 hover:bg-navy-50"
                    title="View Ledger"
                  >
                    <BookOpen size={16} />
                  </button>
                  <button
                    onClick={() => setToggleVendor(v)}
                    className={`rounded p-1 ${v.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                    title={v.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {v.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                </div>
              ),
            },
          ]}
        />
        {loading && vendors.length === 0 && <p className="mt-4 text-sm text-gray-500">Loading vendors...</p>}
      </div>

      <FormModal
        open={showModal}
        title={editing ? 'Edit Vendor' : 'Add Vendor'}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
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
        open={!!toggleVendor}
        title={toggleVendor?.is_active ? 'Deactivate Vendor' : 'Activate Vendor'}
        message={`Are you sure you want to ${toggleVendor?.is_active ? 'deactivate' : 'activate'} ${toggleVendor?.name}?`}
        onConfirm={handleToggle}
        onCancel={() => setToggleVendor(null)}
        destructive={!!toggleVendor?.is_active}
      />
    </div>
  )
}
