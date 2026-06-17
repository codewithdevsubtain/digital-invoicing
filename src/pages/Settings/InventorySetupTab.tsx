import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, PlusCircle, ChevronRight, ChevronDown, Power, PowerOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { Unit, ItemCategory, Warehouse } from '../../lib/types.js'

type SubTab = 'units' | 'categories' | 'warehouses'

export default function InventorySetupTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('units')

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'units' as SubTab, label: 'Units' },
            { id: 'categories' as SubTab, label: 'Categories' },
            { id: 'warehouses' as SubTab, label: 'Warehouses' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition ${
                activeSubTab === tab.id
                  ? 'border-navy-800 text-navy-800'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {activeSubTab === 'units' && <UnitsSection user={user!} addToast={addToast} />}
        {activeSubTab === 'categories' && <CategoriesSection user={user!} addToast={addToast} />}
        {activeSubTab === 'warehouses' && <WarehousesSection user={user!} addToast={addToast} />}
      </div>
    </div>
  )
}

// =====================================================================
// UNITS
// =====================================================================
function UnitsSection({ user, addToast }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>; addToast: ReturnType<typeof useToastStore.getState>['add'] }) {
  const [items, setItems] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [deleting, setDeleting] = useState<Unit | null>(null)
  const [form, setForm] = useState({ name: '', short_code: '' })

  const load = async () => {
    setLoading(true)
    try {
      setItems(await api.inventory.listUnits())
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load units' })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ name: '', short_code: '' }); setShowModal(true) }
  const openEdit = (u: Unit) => { setEditing(u); setForm({ name: u.name, short_code: u.short_code }); setShowModal(true) }

  const handleSubmit = async () => {
    if (!form.name || !form.short_code) {
      addToast({ type: 'warning', title: 'Validation', message: 'Name and short code are required' })
      return
    }
    try {
      if (editing) {
        await api.inventory.updateUnit(user.id, editing.id, form)
        addToast({ type: 'success', title: 'Updated', message: 'Unit updated' })
      } else {
        await api.inventory.createUnit(user.id, form)
        addToast({ type: 'success', title: 'Created', message: 'Unit created' })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.inventory.deleteUnit(user.id, deleting.id)
      addToast({ type: 'success', title: 'Deleted', message: 'Unit deleted' })
      setDeleting(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} unit(s)</p>
        <button onClick={openAdd} className="btn-primary gap-2"><Plus size={16} /> Add Unit</button>
      </div>
      <DataTable
        data={items}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'short_code', header: 'Short Code', render: (r) => <code className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">{r.short_code}</code> },
          { key: 'id', header: 'Actions', render: (r) => (
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); openEdit(r) }} className="btn-secondary !px-2 !py-1"><Pencil size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setDeleting(r) }} className="rounded-md !px-2 !py-1 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
            </div>
          )},
        ]}
      />
      <FormModal open={showModal} title={editing ? 'Edit Unit' : 'Add Unit'} onClose={() => setShowModal(false)} onSubmit={handleSubmit}>
        <div>
          <label className="label-text mb-1">Unit Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Kilogram" />
        </div>
        <div>
          <label className="label-text mb-1">Short Code</label>
          <input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} className="input-field" placeholder="e.g., Kg" />
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleting} title="Delete Unit" message={`Delete "${deleting?.name}"? This cannot be undone if the unit is not in use.`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} destructive confirmLabel="Delete" />
    </div>
  )
}

// =====================================================================
// CATEGORIES
// =====================================================================
function CategoriesSection({ user, addToast }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>; addToast: ReturnType<typeof useToastStore.getState>['add'] }) {
  const [items, setItems] = useState<ItemCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ItemCategory | null>(null)
  const [deleting, setDeleting] = useState<ItemCategory | null>(null)
  const [form, setForm] = useState({ name: '', parent_id: '' as string | number, item_type: '' })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const load = async () => {
    setLoading(true)
    try { setItems(await api.inventory.listCategories()) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load categories' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = (parentId?: number) => {
    setEditing(null)
    setForm({ name: '', parent_id: parentId ?? '', item_type: '' })
    setShowModal(true)
  }
  const openEdit = (c: ItemCategory) => {
    setEditing(c)
    setForm({ name: c.name, parent_id: c.parent_id ?? '', item_type: c.item_type ?? '' })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name) {
      addToast({ type: 'warning', title: 'Validation', message: 'Category name is required' })
      return
    }
    try {
      const data = {
        name: form.name,
        parent_id: form.parent_id !== '' ? Number(form.parent_id) : null,
        item_type: form.item_type || null,
      }
      if (editing) {
        await api.inventory.updateCategory(user.id, editing.id, data)
        addToast({ type: 'success', title: 'Updated', message: 'Category updated' })
      } else {
        await api.inventory.createCategory(user.id, data)
        addToast({ type: 'success', title: 'Created', message: 'Category created' })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.inventory.deleteCategory(user.id, deleting.id)
      addToast({ type: 'success', title: 'Deleted', message: 'Category deleted' })
      setDeleting(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const toggleExpand = (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpanded(next)
  }

  const rootCategories = items.filter((c) => !c.parent_id)

  const renderCategoryTree = (parentId: number | null, depth: number = 0): React.ReactNode => {
    const children = items.filter((c) => c.parent_id === parentId)
    if (children.length === 0) return null

    return (
      <ul className={depth > 0 ? 'ml-6 border-l border-gray-200 pl-4' : ''}>
        {children.map((cat) => {
          const hasChildren = items.some((c) => c.parent_id === cat.id)
          const isExpanded = expanded.has(cat.id)
          return (
            <li key={cat.id} className="py-1.5">
              <div className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-gray-50 group">
                <div className="flex items-center gap-2">
                  {hasChildren ? (
                    <button onClick={() => toggleExpand(cat.id)} className="text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : <span className="w-[14px]" />}
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  {cat.item_type && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{cat.item_type.replace('_', ' ')}</span>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={(e) => { e.stopPropagation(); openAdd(cat.id) }} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600" title="Add subcategory"><PlusCircle size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(cat) }} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600" title="Edit"><Pencil size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleting(cat) }} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
              {isExpanded && hasChildren && renderCategoryTree(cat.id, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  const catOptions = items.map((c) => ({ value: c.id, label: c.name }))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} category/categories</p>
        <button onClick={() => openAdd()} className="btn-primary gap-2"><Plus size={16} /> Add Category</button>
      </div>
      <div className="card p-4">
        {rootCategories.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No categories yet.</p>
        ) : renderCategoryTree(null)}
      </div>

      <FormModal open={showModal} title={editing ? 'Edit Category' : 'Add Category'} onClose={() => setShowModal(false)} onSubmit={handleSubmit}>
        <div>
          <label className="label-text mb-1">Category Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Sheet Metal" />
        </div>
        <div>
          <label className="label-text mb-1">Parent Category</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="input-field">
            <option value="">None (root category)</option>
            {catOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-text mb-1">Item Type (optional filter)</label>
          <select value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })} className="input-field">
            <option value="">All types</option>
            <option value="raw_material">Raw Material</option>
            <option value="finished_good">Finished Good</option>
            <option value="fabricated">Fabricated</option>
            <option value="service">Service</option>
          </select>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleting} title="Delete Category" message={`Delete "${deleting?.name}"? It must have no subcategories and no items assigned.`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} destructive confirmLabel="Delete" />
    </div>
  )
}

// =====================================================================
// WAREHOUSES
// =====================================================================
function WarehousesSection({ user, addToast }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>; addToast: ReturnType<typeof useToastStore.getState>['add'] }) {
  const [items, setItems] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [toggling, setToggling] = useState<Warehouse | null>(null)
  const [form, setForm] = useState({ name: '', location: '' })

  const load = async () => {
    setLoading(true)
    try { setItems(await api.inventory.listWarehouses()) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load warehouses' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ name: '', location: '' }); setShowModal(true) }
  const openEdit = (w: Warehouse) => { setEditing(w); setForm({ name: w.name, location: w.location ?? '' }); setShowModal(true) }

  const handleSubmit = async () => {
    if (!form.name) {
      addToast({ type: 'warning', title: 'Validation', message: 'Warehouse name is required' })
      return
    }
    try {
      if (editing) {
        await api.inventory.updateWarehouse(user.id, editing.id, { name: form.name, location: form.location || undefined })
        addToast({ type: 'success', title: 'Updated', message: 'Warehouse updated' })
      } else {
        await api.inventory.createWarehouse(user.id, { name: form.name, location: form.location || undefined })
        addToast({ type: 'success', title: 'Created', message: 'Warehouse created' })
      }
      setShowModal(false); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleToggle = async () => {
    if (!toggling) return
    try {
      await api.inventory.toggleWarehouse(user.id, toggling.id)
      addToast({ type: 'success', title: 'Updated', message: `Warehouse ${toggling.is_active ? 'deactivated' : 'activated'}` })
      setToggling(null); load()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} warehouse(s)</p>
        <button onClick={openAdd} className="btn-primary gap-2"><Plus size={16} /> Add Warehouse</button>
      </div>
      <DataTable
        data={items}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'location', header: 'Location', render: (r) => r.location ?? '-' },
          { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
          { key: 'id', header: 'Actions', render: (r) => (
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); openEdit(r) }} className="btn-secondary !px-2 !py-1"><Pencil size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setToggling(r) }} className="btn-secondary !px-2 !py-1">
                {r.is_active ? <PowerOff size={14} /> : <Power size={14} />}
              </button>
            </div>
          )},
        ]}
      />
      <FormModal open={showModal} title={editing ? 'Edit Warehouse' : 'Add Warehouse'} onClose={() => setShowModal(false)} onSubmit={handleSubmit}>
        <div>
          <label className="label-text mb-1">Warehouse Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Main Warehouse" />
        </div>
        <div>
          <label className="label-text mb-1">Location / Description</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-field" placeholder="e.g., Primary storage facility" />
        </div>
      </FormModal>
      <ConfirmDialog open={!!toggling} title={toggling?.is_active ? 'Deactivate Warehouse' : 'Activate Warehouse'} message={`${toggling?.is_active ? 'Deactivate' : 'Activate'} "${toggling?.name}"?`} onConfirm={handleToggle} onCancel={() => setToggling(null)} confirmLabel={toggling?.is_active ? 'Deactivate' : 'Activate'} />
    </div>
  )
}
