import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { ExpenseCategory } from '../../lib/types.js'

type SubTab = 'list' | 'categories'

export default function Expenses() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [activeTab, setActiveTab] = useState<SubTab>('list')
  const defaultGst = ''

  // ============= EXPENSES LIST =============
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ category_id: '' as string | number, date_from: '', date_to: '', paid_via: '' })
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [summary, setSummary] = useState<{ total: number; by_category: Array<{ id: number; name: string; total: number }> }>({ total: 0, by_category: [] })

  // Form
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ category_id: '' as string | number, description: '', amount: '', date: new Date().toISOString().split('T')[0], paid_via: 'cash', bank_account_id: '' as string | number })
  const [deleting, setDeleting] = useState<any>(null)

  // ============= CATEGORIES =============
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState<ExpenseCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', type: 'admin' })

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.expenses.list(user.id, {
        ...(filters.category_id ? { category_id: Number(filters.category_id) } : {}),
        ...(filters.date_from ? { date_from: filters.date_from } : {}),
        ...(filters.date_to ? { date_to: filters.date_to } : {}),
        ...(filters.paid_via ? { paid_via: filters.paid_via } : {}),
      })
      setItems(list)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load expenses' }) }
    finally { setLoading(false) }
  }, [user, filters, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const c = await api.expenses.categories.list()
      setCategories(c)
    } catch { /* ignore */ }
  }, [user])

  const loadSummary = useCallback(async () => {
    if (!user) return
    try {
      const s = await api.expenses.summary(user.id, { date_from: filters.date_from || undefined, date_to: filters.date_to || undefined })
      setSummary(s)
    } catch { /* ignore */ }
  }, [user, filters])

  useEffect(() => { load(); loadRefs(); loadSummary() }, [load, loadRefs, loadSummary])

  const catOpts = categories.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))
  const catFilterOpts = [{ value: '', label: 'All Categories' }, ...catOpts]

  const handleSubmit = async () => {
    if (!user) return
    if (!form.category_id || !form.amount || !form.date) {
      addToast({ type: 'warning', title: 'Validation', message: 'Category, amount, and date are required' })
      return
    }
    try {
      if (editing) {
        await api.expenses.update(user.id, editing.id, {
          category_id: Number(form.category_id),
          description: form.description || undefined,
          amount: Number(form.amount),
          date: form.date,
          paid_via: form.paid_via,
          bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
        })
        addToast({ type: 'success', title: 'Updated', message: 'Expense updated' })
      } else {
        await api.expenses.create(user.id, {
          category_id: Number(form.category_id),
          description: form.description || undefined,
          amount: Number(form.amount),
          date: form.date,
          paid_via: form.paid_via,
          bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : undefined,
        })
        addToast({ type: 'success', title: 'Created', message: 'Expense recorded' })
      }
      setShowModal(false); load(); loadSummary()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleDelete = async () => {
    if (!user || !deleting) return
    try {
      await api.expenses.delete(user.id, deleting.id)
      addToast({ type: 'success', title: 'Deleted', message: 'Expense deleted' })
      setDeleting(null); load(); loadSummary()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const openAdd = () => {
    setEditing(null); setForm({ category_id: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], paid_via: 'cash', bank_account_id: '' }); setShowModal(true)
  }

  // ========== CATEGORY HANDLERS ==========
  const handleCatSubmit = async () => {
    if (!user) return
    if (!catForm.name) { addToast({ type: 'warning', title: 'Validation', message: 'Name is required' }); return }
    try {
      if (editingCat) {
        await api.expenses.categories.update(user.id, editingCat.id, catForm)
        addToast({ type: 'success', title: 'Updated', message: 'Category updated' })
      } else {
        await api.expenses.categories.create(user.id, catForm)
        addToast({ type: 'success', title: 'Created', message: 'Category created' })
      }
      setShowCatModal(false); loadRefs()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const thisMonthStart = new Date()
  thisMonthStart.setDate(1)
  const currentMonthTotal = summary.total

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Company overhead and admin expenses">
        <button onClick={() => setActiveTab(activeTab === 'list' ? 'categories' : 'list')} className="btn-secondary gap-2">
          {activeTab === 'list' ? 'Manage Categories' : 'Back to Expenses'}
        </button>
      </PageHeader>

      <div className="mt-6">
        {activeTab === 'categories' ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{categories.length} category/categories</p>
              <button onClick={() => { setEditingCat(null); setCatForm({ name: '', type: 'admin' }); setShowCatModal(true) }} className="btn-primary gap-2"><Plus size={16} /> Add Category</button>
            </div>
            <DataTable
              data={categories}
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'type', header: 'Type', render: (r) => <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{r.type}</span> },
                { key: 'account_name', header: 'GL Account', render: (r) => r.account_name ? `${r.account_code} - ${r.account_name}` : 'Auto' },
                { key: 'id', header: '', render: (r) => (
                  <button onClick={(e) => { e.stopPropagation(); setEditingCat(r); setCatForm({ name: r.name, type: r.type }); setShowCatModal(true) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                )},
              ]}
            />
            <FormModal open={showCatModal} title={editingCat ? 'Edit Category' : 'Add Category'} onClose={() => setShowCatModal(false)} onSubmit={handleCatSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Name</label><input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="input-field" placeholder="e.g., Office Supplies" /></div>
                <div><label className="label-text mb-1">Type</label><select value={catForm.type} onChange={(e) => setCatForm({ ...catForm, type: e.target.value })} className="input-field"><option value="admin">Admin</option><option value="project">Project</option><option value="overhead">Overhead</option></select></div>
              </div>
            </FormModal>
          </div>
        ) : (
          <div>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="card p-3"><p className="text-xs text-gray-500">Total ({filters.date_from || 'All'})</p><p className="text-lg font-bold">{formatCurrency(summary.total)}</p></div>
              {summary.by_category.slice(0, 3).map((cat) => (
                <div key={cat.id} className="card p-3"><p className="text-xs text-gray-500">{cat.name}</p><p className="text-lg font-bold">{formatCurrency(cat.total)}</p></div>
              ))}
            </div>

            {/* Filters */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })} className="input-field w-44 text-sm">
                  {[{ value: '', label: 'All Categories' }, ...catOpts].map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>
                <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="input-field text-sm w-36" />
                <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="input-field text-sm w-36" />
                <select value={filters.paid_via} onChange={(e) => setFilters({ ...filters, paid_via: e.target.value })} className="input-field w-28 text-sm">
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <button onClick={openAdd} className="btn-primary gap-2"><Plus size={16} /> New Expense</button>
            </div>

            {/* Category breakdown bar */}
            {summary.by_category.length > 0 && summary.total > 0 && (
              <div className="card p-3 mb-4">
                <div className="flex gap-1 h-4 rounded-full overflow-hidden">
                  {summary.by_category.map((cat, i) => {
                    const pct = (cat.total / summary.total) * 100
                    const colors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-teal-500']
                    return <div key={cat.id} className={`${colors[i % colors.length]} h-full`} style={{ width: `${pct}%` }} title={`${cat.name}: ${formatCurrency(cat.total)}`} />
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  {summary.by_category.map((cat, i) => {
                    const colors = ['text-blue-500', 'text-orange-500', 'text-green-500', 'text-purple-500', 'text-red-500', 'text-teal-500']
                    return <span key={cat.id} className={colors[i % colors.length]}>{cat.name}</span>
                  })}
                </div>
              </div>
            )}

            <DataTable
              data={items}
              columns={[
                { key: 'expense_number', header: '#', render: (r) => <span className="font-mono text-xs">{r.expense_number}</span> },
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'category_name', header: 'Category' },
                { key: 'description', header: 'Description', render: (r) => r.description ?? '-' },
                { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span> },
                { key: 'paid_via', header: 'Paid Via', render: (r) => r.paid_via === 'cash' ? 'Cash' : 'Bank' },
                { key: 'id', header: 'Actions', render: (r) => (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditing(r); setForm({ category_id: r.category_id, description: r.description ?? '', amount: String(r.amount), date: r.date, paid_via: r.paid_via, bank_account_id: r.bank_account_id ?? '' }); setShowModal(true) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                    <button onClick={() => setDeleting(r)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                )},
              ]}
            />
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      <FormModal open={showModal} title={editing ? 'Edit Expense' : 'New Expense'} onClose={() => setShowModal(false)} onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input-field">
            <option value="">Select category *</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div><label className="label-text mb-1">Amount *</label><input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-field" /></div>
        </div>
        <div><label className="label-text mb-1">Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="e.g., Office rent for June" /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Date *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" /></div>
          <div>
            <label className="label-text mb-1">Paid Via</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="paid_via" value="cash" checked={form.paid_via === 'cash'} onChange={() => setForm({ ...form, paid_via: 'cash' })} /> Cash</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="paid_via" value="bank" checked={form.paid_via === 'bank'} onChange={() => setForm({ ...form, paid_via: 'bank' })} /> Bank</label>
            </div>
          </div>
        </div>
      </FormModal>

      {/* Delete Confirm */}
      <ConfirmDialog open={!!deleting} title="Delete Expense" message={`Delete expense "${deleting?.expense_number}"? This will reverse the cash/bank transaction and journal entry.`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} destructive confirmLabel="Delete" />
    </div>
  )
}
