import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, Users, Receipt, FileText, BarChart3, Plus, Undo2, ArrowUpDown } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import Loading from '../../components/Loading.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { Project, ProjectMaterialIssuedRow, ProjectMaterialReturnRow, ProjectLaborRow, ProjectProfitability } from '../../lib/types.js'

type DetailTab = 'overview' | 'materials' | 'labor' | 'expenses' | 'pnl'

const tabs: { id: DetailTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'materials', label: 'Materials', icon: Package },
  { id: 'labor', label: 'Labor', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'pnl', label: 'Profit & Loss', icon: FileText },
]

const expenseCategories = ['Transport', 'Tools & Equipment', 'Site Misc', 'Equipment Rental', 'Labor Camp', 'Food & Board', 'Fuel', 'Safety Equipment', 'Permits', 'Other']

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const navigate = useNavigate()

  const [project, setProject] = useState<(Project & { customer_name: string | null }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  // Reference data
  const [warehouses, setWarehouses] = useState<Array<{ value: string | number; label: string }>>([])
  const [items, setItems] = useState<Array<{ value: string | number; label: string }>>([])
  const [employees, setEmployees] = useState<Array<{ value: string | number; label: string }>>([])
  const [bankAccounts, setBankAccounts] = useState<Array<{ value: string | number; label: string }>>([])

  // Materials
  const [materials, setMaterials] = useState<{ issued: ProjectMaterialIssuedRow[]; returns: ProjectMaterialReturnRow[]; issued_total: number; net_cost: number } | null>(null)
  const [showIssueMaterial, setShowIssueMaterial] = useState(false)
  const [issueForm, setIssueForm] = useState({ item_id: '' as string | number, warehouse_id: '' as string | number, quantity: '', date: new Date().toISOString().split('T')[0], issued_to: '', notes: '' })
  const [showReturnMaterial, setShowReturnMaterial] = useState(false)
  const [returnForm, setReturnForm] = useState({ item_id: '' as string | number, warehouse_id: '' as string | number, quantity: '', date: new Date().toISOString().split('T')[0], notes: '' })

  // Labor
  const [laborData, setLaborData] = useState<{ rows: ProjectLaborRow[]; total: number } | null>(null)
  const [showAddLabor, setShowAddLabor] = useState(false)
  const [laborForm, setLaborForm] = useState({ employee_id: '' as string | number, date: new Date().toISOString().split('T')[0], hours_worked: '8', rate_per_hour: '', is_full_day: true, daily_wage_amount: '', description: '' })

  // Expenses
  const [expenseData, setExpenseData] = useState<{ rows: any[]; total: number } | null>(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ expense_category: 'Transport', description: '', amount: '', date: new Date().toISOString().split('T')[0], paid_via: 'cash', bank_account_id: '' as string | number })

  // P&L
  const [profitability, setProfitability] = useState<ProjectProfitability | null>(null)

  const loadProject = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const p = await api.projects.get(user.id, projectId)
      setProject(p)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load project' }) }
    finally { setLoading(false) }
  }, [user, projectId, addToast])

  const loadRefs = useCallback(async () => {
    if (!user) return
    try {
      const [w, i, e, b] = await Promise.all([
        api.inventory.listWarehouses().then((wh) => wh.filter((x) => x.is_active)),
        api.inventory.listItems(user.id, { is_active: true }),
        user ? api.hr.list().catch(() => []) : [],
        user ? api.accounting.list().catch(() => []) : [],
      ])
      setWarehouses(w.map((x) => ({ value: x.id, label: x.name })))
      setItems(i.map((x) => ({ value: x.id, label: `${x.item_code ?? ''} - ${x.name}` })))
      setEmployees((Array.isArray(e) ? e : []).map((x: any) => ({ value: x.id, label: x.full_name ?? `Employee #${x.id}` })))
      setBankAccounts((Array.isArray(b) ? b : []).map((x: any) => ({ value: x.id, label: x.account_name ?? `Bank #${x.id}` })))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { loadProject(); loadRefs() }, [loadProject, loadRefs])

  const loadMaterials = useCallback(async () => {
    if (!user) return
    try { setMaterials(await api.projects.getMaterials(user.id, projectId)) } catch { /* ignore */ }
  }, [user, projectId])

  const loadLabor = useCallback(async () => {
    if (!user) return
    try { setLaborData(await api.projects.getLaborCosts(user.id, projectId)) } catch { /* ignore */ }
  }, [user, projectId])

  const loadExpenses = useCallback(async () => {
    if (!user) return
    try { setExpenseData(await api.projects.getExpenses(user.id, projectId)) } catch { /* ignore */ }
  }, [user, projectId])

  const loadPnL = useCallback(async () => {
    if (!user) return
    try { setProfitability(await api.projects.profitability(user.id, projectId)) } catch { /* ignore */ }
  }, [user, projectId])

  useEffect(() => {
    if (activeTab === 'materials') loadMaterials()
    if (activeTab === 'labor') loadLabor()
    if (activeTab === 'expenses') loadExpenses()
    if (activeTab === 'pnl' || activeTab === 'overview') loadPnL()
  }, [activeTab, loadMaterials, loadLabor, loadExpenses, loadPnL])

  const handleStatusChange = async (newStatus: string) => {
    if (!user || !project) return
    try {
      await api.projects.updateStatus(user.id, projectId, newStatus)
      addToast({ type: 'success', title: 'Updated', message: `Status changed to ${newStatus}` })
      loadProject()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleIssueMaterial = async () => {
    if (!user) return
    if (!issueForm.item_id || !issueForm.warehouse_id || !issueForm.quantity) {
      addToast({ type: 'warning', title: 'Validation', message: 'Item, warehouse, and quantity are required' })
      return
    }
    try {
      const r = await api.projects.issueMaterial(user.id, {
        project_id: projectId, item_id: Number(issueForm.item_id), warehouse_id: Number(issueForm.warehouse_id),
        quantity: Number(issueForm.quantity), date: issueForm.date, issued_to: issueForm.issued_to || undefined,
        notes: issueForm.notes || undefined,
      })
      if (r.error === 'insufficient_stock') {
        addToast({ type: 'warning', title: 'Insufficient Stock', message: r.message ?? 'Stock too low. Reduce quantity or use override.' })
        return
      }
      addToast({ type: 'success', title: 'Issued', message: `Material issued (cost: ${formatCurrency(r.total_cost ?? 0)})` })
      setShowIssueMaterial(false); loadMaterials(); loadPnL()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleReturnMaterial = async () => {
    if (!user) return
    if (!returnForm.item_id || !returnForm.warehouse_id || !returnForm.quantity) {
      addToast({ type: 'warning', title: 'Validation', message: 'Item, warehouse, and quantity are required' })
      return
    }
    try {
      await api.projects.returnMaterial(user.id, {
        project_id: projectId, item_id: Number(returnForm.item_id), warehouse_id: Number(returnForm.warehouse_id),
        quantity: Number(returnForm.quantity), date: returnForm.date, notes: returnForm.notes || undefined,
      })
      addToast({ type: 'success', title: 'Returned', message: 'Material returned to stock' })
      setShowReturnMaterial(false); loadMaterials(); loadPnL()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleAddLabor = async () => {
    if (!user) return
    if (!laborForm.date) { addToast({ type: 'warning', title: 'Validation', message: 'Date is required' }); return }
    try {
      const dailyWage = laborForm.is_full_day
        ? Number(laborForm.daily_wage_amount) || undefined
        : undefined
      const hours = laborForm.is_full_day ? undefined : Number(laborForm.hours_worked) || undefined
      const rate = laborForm.is_full_day ? undefined : Number(laborForm.rate_per_hour) || undefined
      await api.projects.addLaborCost(user.id, {
        project_id: projectId, employee_id: laborForm.employee_id ? Number(laborForm.employee_id) : undefined,
        date: laborForm.date, hours_worked: hours, rate_per_hour: rate, daily_wage_amount: dailyWage,
        description: laborForm.description || undefined,
      })
      addToast({ type: 'success', title: 'Added', message: 'Labor cost recorded' })
      setShowAddLabor(false); loadLabor(); loadPnL()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleAddExpense = async () => {
    if (!user) return
    if (!expenseForm.expense_category || !expenseForm.amount || !expenseForm.date) {
      addToast({ type: 'warning', title: 'Validation', message: 'Category, amount, and date are required' })
      return
    }
    try {
      await api.projects.addExpense(user.id, {
        project_id: projectId, expense_category: expenseForm.expense_category,
        description: expenseForm.description || undefined, amount: Number(expenseForm.amount),
        date: expenseForm.date, paid_via: expenseForm.paid_via || undefined,
        bank_account_id: expenseForm.bank_account_id ? Number(expenseForm.bank_account_id) : undefined,
      })
      addToast({ type: 'success', title: 'Added', message: 'Expense recorded' })
      setShowAddExpense(false); loadExpenses(); loadPnL()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  if (loading) return <Loading text="Loading project..." />
  if (!project) return <div className="p-6 text-gray-500">Project not found.</div>

  return (
    <div>
      {/* Back button + header */}
      <button onClick={() => navigate('/projects')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft size={16} /> Back to Projects</button>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{project.project_name}</h2>
              <select value={project.status} onChange={(e) => handleStatusChange(e.target.value)} className="text-sm rounded-lg border-gray-200 py-1">
                <option value="quotation">Quotation</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {project.project_code} &middot; {project.customer_name ?? 'No customer'} &middot; Started {project.start_date ? formatDate(project.start_date) : '-'}
              {project.expected_end_date ? ` &middot; Expected ${formatDate(project.expected_end_date)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Contract Value</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(project.contract_value)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${
                  activeTab === tab.id ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              ><Icon size={16} /> {tab.label}</button>
            )
          })}
        </nav>
      </div>

      <div className="mt-6">
        {/* OVERVIEW */}
        {activeTab === 'overview' && profitability && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500">Revenue</p><p className="text-lg font-bold text-gray-900">{formatCurrency(profitability.revenue)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Material Cost</p><p className="text-lg font-bold text-orange-600">{formatCurrency(profitability.material_cost)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Labor Cost</p><p className="text-lg font-bold text-orange-600">{formatCurrency(profitability.labor_cost)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Other Expenses</p><p className="text-lg font-bold text-orange-600">{formatCurrency(profitability.other_expenses)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Net Profit</p><p className={`text-lg font-bold ${profitability.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(profitability.gross_profit)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Profit Margin</p><p className={`text-lg font-bold ${profitability.profit_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitability.profit_margin_percent}%</p></div>
            </div>

            {/* Simple visual bar chart for cost breakdown */}
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Cost Breakdown</h3>
              {profitability.total_costs > 0 ? (
                <div className="space-y-3">
                  {[
                    { label: 'Material Cost', value: profitability.material_cost, color: 'bg-orange-500' },
                    { label: 'Labor Cost', value: profitability.labor_cost, color: 'bg-blue-500' },
                    { label: 'Other Expenses', value: profitability.other_expenses, color: 'bg-purple-500' },
                  ].map((item) => {
                    const pct = profitability.total_costs > 0 ? (item.value / profitability.total_costs) * 100 : 0
                    return pct > 0 ? (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1"><span>{item.label}</span><span>{formatCurrency(item.value)} ({pct.toFixed(1)}%)</span></div>
                        <div className="h-3 w-full rounded-full bg-gray-100"><div className={`h-3 rounded-full ${item.color}`} style={{ width: `${pct}%` }} /></div>
                      </div>
                    ) : null
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No costs recorded yet.</p>
              )}
            </div>
          </div>
        )}

        {/* MATERIALS */}
        {activeTab === 'materials' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setShowIssueMaterial(true)} className="btn-primary gap-2"><Plus size={16} /> Issue Material</button>
              <button onClick={() => setShowReturnMaterial(true)} className="btn-secondary gap-2"><Undo2 size={16} /> Return Material</button>
              <span className="text-sm text-gray-500">Net Material Cost: <strong>{formatCurrency(materials?.net_cost ?? 0)}</strong></span>
            </div>

            <h4 className="text-sm font-semibold text-gray-700 mb-2">Issued Materials</h4>
            <DataTable
              data={materials?.issued ?? []}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'item_name', header: 'Item' },
                { key: 'item_code', header: 'Code', render: (r) => r.item_code ?? '-' },
                { key: 'quantity_issued', header: 'Qty' },
                { key: 'unit_cost', header: 'Unit Cost', render: (r) => formatCurrency(r.unit_cost) },
                { key: 'total_cost', header: 'Total', render: (r) => formatCurrency(r.total_cost) },
                { key: 'issued_to', header: 'Issued To', render: (r) => r.issued_to ?? '-' },
                { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '-' },
              ]}
            />

            {materials?.returns && materials.returns.length > 0 && (
              <>
                <h4 className="mt-6 text-sm font-semibold text-gray-700 mb-2">Returned Materials</h4>
                <DataTable
                  data={materials.returns}
                  columns={[
                    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                    { key: 'item_name', header: 'Item' },
                    { key: 'quantity_returned', header: 'Qty Returned' },
                    { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '-' },
                  ]}
                />
              </>
            )}

            {/* Issue Material Modal */}
            <FormModal open={showIssueMaterial} title="Issue Material to Project" onClose={() => setShowIssueMaterial(false)} onSubmit={handleIssueMaterial} submitLabel="Issue">
              <SearchableSelect label="Item" options={items} value={issueForm.item_id} onChange={(v) => setIssueForm({ ...issueForm, item_id: v })} placeholder="Select item" />
              <SearchableSelect label="Warehouse" options={warehouses} value={issueForm.warehouse_id} onChange={(v) => setIssueForm({ ...issueForm, warehouse_id: v })} placeholder="Select warehouse" />
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Quantity</label><input type="number" step="0.01" min="0" value={issueForm.quantity} onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Date</label><input type="date" value={issueForm.date} onChange={(e) => setIssueForm({ ...issueForm, date: e.target.value })} className="input-field" /></div>
              </div>
              <div><label className="label-text mb-1">Issued To</label><input value={issueForm.issued_to} onChange={(e) => setIssueForm({ ...issueForm, issued_to: e.target.value })} className="input-field" placeholder="Technician / team name" /></div>
              <div><label className="label-text mb-1">Notes</label><input value={issueForm.notes} onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })} className="input-field" /></div>
            </FormModal>

            {/* Return Material Modal */}
            <FormModal open={showReturnMaterial} title="Return Material to Stock" onClose={() => setShowReturnMaterial(false)} onSubmit={handleReturnMaterial} submitLabel="Return">
              <SearchableSelect label="Item" options={items} value={returnForm.item_id} onChange={(v) => setReturnForm({ ...returnForm, item_id: v })} placeholder="Select item" />
              <div className="grid gap-4 md:grid-cols-2">
                <SearchableSelect label="Warehouse" options={warehouses} value={returnForm.warehouse_id} onChange={(v) => setReturnForm({ ...returnForm, warehouse_id: v })} placeholder="Select warehouse" />
                <div><label className="label-text mb-1">Quantity</label><input type="number" step="0.01" min="0" value={returnForm.quantity} onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })} className="input-field" /></div>
              </div>
              <div><label className="label-text mb-1">Date</label><input type="date" value={returnForm.date} onChange={(e) => setReturnForm({ ...returnForm, date: e.target.value })} className="input-field" /></div>
              <div><label className="label-text mb-1">Notes</label><input value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} className="input-field" /></div>
            </FormModal>
          </div>
        )}

        {/* LABOR */}
        {activeTab === 'labor' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => { setLaborForm({ ...laborForm, daily_wage_amount: '', hours_worked: '8', rate_per_hour: '' }); setShowAddLabor(true) }} className="btn-primary gap-2"><Plus size={16} /> Add Labor Entry</button>
              <span className="text-sm text-gray-500">Total Labor Cost: <strong>{formatCurrency(laborData?.total ?? 0)}</strong></span>
            </div>

            <DataTable
              data={laborData?.rows ?? []}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'employee_name', header: 'Employee', render: (r) => r.employee_name ?? '-' },
                { key: 'hours_worked', header: 'Hours', render: (r) => r.hours_worked > 0 ? r.hours_worked : (r.daily_wage_amount > 0 ? 'Full Day' : '-') },
                { key: 'rate_per_hour', header: 'Rate/Hr', render: (r) => r.rate_per_hour > 0 ? formatCurrency(r.rate_per_hour) : '-' },
                { key: 'daily_wage_amount', header: 'Amount', render: (r) => formatCurrency(r.daily_wage_amount) },
                { key: 'description', header: 'Description', render: (r) => r.description ?? '-' },
              ]}
            />

            <FormModal open={showAddLabor} title="Add Labor Cost" onClose={() => setShowAddLabor(false)} onSubmit={handleAddLabor} submitLabel="Add">
              <div className="grid gap-4 md:grid-cols-2">
                <SearchableSelect label="Employee (optional)" options={employees} value={laborForm.employee_id} onChange={(v) => setLaborForm({ ...laborForm, employee_id: v })} placeholder="Select employee" />
                <div><label className="label-text mb-1">Date</label><input type="date" value={laborForm.date} onChange={(e) => setLaborForm({ ...laborForm, date: e.target.value })} className="input-field" /></div>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={laborForm.is_full_day} onChange={(e) => setLaborForm({ ...laborForm, is_full_day: e.target.checked })} /> Full Day</label>
              </div>
              {laborForm.is_full_day ? (
                <div>
                  <label className="label-text mb-1">Daily Wage Amount</label>
                  <input type="number" step="0.01" min="0" value={laborForm.daily_wage_amount} onChange={(e) => setLaborForm({ ...laborForm, daily_wage_amount: e.target.value })} className="input-field" placeholder="0.00" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div><label className="label-text mb-1">Hours Worked</label><input type="number" step="0.5" min="0" value={laborForm.hours_worked} onChange={(e) => setLaborForm({ ...laborForm, hours_worked: e.target.value })} className="input-field" /></div>
                  <div><label className="label-text mb-1">Rate per Hour</label><input type="number" step="0.01" min="0" value={laborForm.rate_per_hour} onChange={(e) => setLaborForm({ ...laborForm, rate_per_hour: e.target.value })} className="input-field" /></div>
                </div>
              )}
              <div><label className="label-text mb-1">Description</label><input value={laborForm.description} onChange={(e) => setLaborForm({ ...laborForm, description: e.target.value })} className="input-field" placeholder="e.g., Duct installation day 3" /></div>
            </FormModal>
          </div>
        )}

        {/* EXPENSES */}
        {activeTab === 'expenses' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setShowAddExpense(true)} className="btn-primary gap-2"><Plus size={16} /> Add Expense</button>
              <span className="text-sm text-gray-500">Total Expenses: <strong>{formatCurrency(expenseData?.total ?? 0)}</strong></span>
            </div>

            <DataTable
              data={expenseData?.rows ?? []}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'expense_category', header: 'Category' },
                { key: 'description', header: 'Description', render: (r) => r.description ?? '-' },
                { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount) },
                { key: 'paid_via', header: 'Paid Via', render: (r) => r.paid_via ?? '-' },
              ]}
            />

            <FormModal open={showAddExpense} title="Add Project Expense" onClose={() => setShowAddExpense(false)} onSubmit={handleAddExpense} submitLabel="Add Expense">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label-text mb-1">Category</label>
                  <select value={expenseForm.expense_category} onChange={(e) => setExpenseForm({ ...expenseForm, expense_category: e.target.value })} className="input-field">
                    {expenseCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div><label className="label-text mb-1">Date</label><input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="input-field" /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Amount</label><input type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="input-field" /></div>
                <div>
                  <label className="label-text mb-1">Paid Via</label>
                  <select value={expenseForm.paid_via} onChange={(e) => setExpenseForm({ ...expenseForm, paid_via: e.target.value })} className="input-field">
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
              </div>
              {expenseForm.paid_via === 'bank' && (
                <SearchableSelect label="Bank Account" options={bankAccounts} value={expenseForm.bank_account_id} onChange={(v) => setExpenseForm({ ...expenseForm, bank_account_id: v })} placeholder="Select bank account" />
              )}
              <div><label className="label-text mb-1">Description</label><input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input-field" /></div>
            </FormModal>
          </div>
        )}

        {/* PROFIT & LOSS */}
        {activeTab === 'pnl' && profitability && (
          <div className="card p-6 max-w-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Profit & Loss</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b"><span className="font-medium text-gray-900">Revenue (Invoiced)</span><span className="font-bold text-green-600">{formatCurrency(profitability.revenue)}</span></div>
              <div className="pt-2"><span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Costs</span></div>
              <div className="flex justify-between pl-4"><span>Material Cost</span><span>{formatCurrency(profitability.material_cost)}</span></div>
              <div className="flex justify-between pl-4"><span>Labor Cost</span><span>{formatCurrency(profitability.labor_cost)}</span></div>
              <div className="flex justify-between pl-4 border-b pb-2"><span>Other Expenses</span><span>{formatCurrency(profitability.other_expenses)}</span></div>
              <div className="flex justify-between py-2"><span className="font-medium text-gray-900">Total Costs</span><span className="font-bold">{formatCurrency(profitability.total_costs)}</span></div>
              <div className={`flex justify-between py-3 border-t-2 border-gray-900 ${profitability.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                <span className="text-base font-bold">Net Profit / (Loss)</span>
                <span className="text-base font-bold">{formatCurrency(profitability.gross_profit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Profit Margin</span>
                <span className={`font-bold ${profitability.profit_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitability.profit_margin_percent}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
