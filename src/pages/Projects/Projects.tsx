import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { ProjectRow, Customer } from '../../lib/types.js'

const emptyForm = {
  project_name: '', customer_id: '' as string | number, site_address: '', description: '',
  start_date: '', expected_end_date: '', contract_value: '', status: 'quotation',
}

export default function Projects() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const navigate = useNavigate()
  const [items, setItems] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [customers, setCustomers] = useState<Array<{ value: string | number; label: string }>>([])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.projects.list(user.id, {
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setItems(list)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load projects' }) }
    finally { setLoading(false) }
  }, [user, search, statusFilter, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const c = await api.customers.list(user.id, { isActive: true })
      setCustomers(c.map((x) => ({ value: x.id, label: `${x.name}${x.company_name ? ` (${x.company_name})` : ''}` })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { load(); loadRefs() }, [load, loadRefs])

  const handleCreate = async () => {
    if (!user) return
    if (!form.project_name) { addToast({ type: 'warning', title: 'Validation', message: 'Project name is required' }); return }
    try {
      const r = await api.projects.create(user.id, {
        project_name: form.project_name,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        site_address: form.site_address || undefined,
        description: form.description || undefined,
        start_date: form.start_date || undefined,
        expected_end_date: form.expected_end_date || undefined,
        contract_value: Number(form.contract_value) || 0,
        status: form.status,
      })
      addToast({ type: 'success', title: 'Created', message: `Project ${r.project_code} created` })
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  return (
    <div>
      <PageHeader title="Projects" subtitle="Manage HVAC projects and sites">
        <button onClick={() => { setForm(emptyForm); setShowModal(true) }} className="btn-primary gap-2"><Plus size={18} /> New Project</button>
      </PageHeader>

      <div className="mt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." className="input-field pl-9" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-36 text-sm">
            <option value="">All Statuses</option>
            <option value="quotation">Quotation</option>
            <option value="approved">Approved</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-sm text-gray-500">{items.length} project(s)</span>
        </div>

        <DataTable
          data={items}
          onRowClick={(row) => navigate(`/projects/${row.id}`)}
          columns={[
            { key: 'project_code', header: 'Code', render: (r) => <span className="font-mono text-xs font-medium">{r.project_code ?? '-'}</span> },
            { key: 'project_name', header: 'Project Name' },
            { key: 'customer_name', header: 'Customer', render: (r) => r.customer_name ?? '-' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status.replace(/_/g, ' ')} /> },
            { key: 'contract_value', header: 'Contract Value', render: (r) => formatCurrency(r.contract_value) },
            { key: 'start_date', header: 'Start', render: (r) => r.start_date ? formatDate(r.start_date) : '-' },
            { key: 'revenue_invoiced', header: 'Revenue', render: (r) => formatCurrency(r.revenue_invoiced) },
            { key: 'id', header: 'Profit', render: (r) => {
              const profit = r.revenue_invoiced - r.total_material_cost - r.total_labor_cost - r.total_other_expenses
              return <span className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(profit)}</span>
            }},
            { key: 'id', header: '', render: (r) => (
              <button onClick={(e) => { e.stopPropagation(); navigate(`/projects/${r.id}`) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Eye size={14} /></button>
            )},
          ]}
        />
      </div>

      <FormModal open={showModal} title="New Project" onClose={() => setShowModal(false)} onSubmit={handleCreate} submitLabel="Create Project">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label-text mb-1">Project Name *</label><input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} className="input-field" placeholder="e.g., Al-Rashid Tower AC Installation" /></div>
          <SearchableSelect label="Customer" options={customers} value={form.customer_id} onChange={(v) => setForm({ ...form, customer_id: v })} placeholder="Select customer" />
          <div><label className="label-text mb-1">Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field"><option value="quotation">Quotation</option><option value="approved">Approved</option><option value="in_progress">In Progress</option></select></div>
        </div>
        <div><label className="label-text mb-1">Site Address</label><textarea value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} className="input-field" rows={2} placeholder="Project site address" /></div>
        <div><label className="label-text mb-1">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} /></div>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label-text mb-1">Start Date</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Expected End</label><input type="date" value={form.expected_end_date} onChange={(e) => setForm({ ...form, expected_end_date: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Contract Value</label><input type="number" step="0.01" min="0" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} className="input-field" /></div>
        </div>
      </FormModal>
    </div>
  )
}
