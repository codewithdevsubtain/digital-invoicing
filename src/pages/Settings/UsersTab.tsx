import { useEffect, useState } from 'react'
import { Plus, Pencil, KeyRound, UserX } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import type { User } from '../../lib/types.js'

type SafeUser = Omit<User, 'password_hash'>

const roles = ['admin', 'accountant', 'storekeeper', 'technician', 'viewer']

export default function UsersTab() {
  const { user: currentUser } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<SafeUser | null>(null)
  const [resetting, setResetting] = useState<SafeUser | null>(null)
  const [deactivating, setDeactivating] = useState<SafeUser | null>(null)

  const [form, setForm] = useState({
    username: '',
    full_name: '',
    role: 'viewer',
    password: '',
    is_active: 1,
  })

  const loadUsers = async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      const data = await api.users.list(currentUser.id)
      setUsers(data)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load users' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [currentUser])

  const resetForm = () => {
    setForm({ username: '', full_name: '', role: 'viewer', password: '', is_active: 1 })
  }

  const handleCreate = async () => {
    if (!currentUser) return
    try {
      await api.users.create(currentUser.id, {
        username: form.username,
        full_name: form.full_name,
        role: form.role,
        password: form.password || 'changeme123',
      })
      addToast({ type: 'success', title: 'User created', message: `${form.username} added successfully` })
      setShowAdd(false)
      resetForm()
      loadUsers()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Create failed' })
    }
  }

  const handleUpdate = async () => {
    if (!currentUser || !editing) return
    try {
      await api.users.update(currentUser.id, editing.id, {
        full_name: form.full_name,
        role: form.role,
        is_active: form.is_active,
      })
      addToast({ type: 'success', title: 'User updated', message: `${editing.username} updated` })
      setEditing(null)
      resetForm()
      loadUsers()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Update failed' })
    }
  }

  const handleDeactivate = async () => {
    if (!currentUser || !deactivating) return
    try {
      await api.users.deactivate(currentUser.id, deactivating.id)
      addToast({ type: 'success', title: 'User deactivated', message: `${deactivating.username} deactivated` })
      setDeactivating(null)
      loadUsers()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Deactivate failed' })
    }
  }

  const handleResetPassword = async () => {
    if (!currentUser || !resetting) return
    try {
      await api.users.resetPassword(currentUser.id, resetting.id, form.password)
      addToast({ type: 'success', title: 'Password reset', message: `${resetting.username} must change password on next login` })
      setResetting(null)
      setForm((f) => ({ ...f, password: '' }))
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Reset failed' })
    }
  }

  const openEdit = (u: SafeUser) => {
    setEditing(u)
    setForm({
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      password: '',
      is_active: u.is_active,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { resetForm(); setShowAdd(true) }} className="btn-primary gap-2">
          <Plus size={18} />
          Add User
        </button>
      </div>

      <DataTable
        data={users}
        columns={[
          { key: 'username', header: 'Username' },
          { key: 'full_name', header: 'Full Name' },
          { key: 'role', header: 'Role', render: (u) => <span className="capitalize">{u.role}</span> },
          {
            key: 'is_active',
            header: 'Status',
            render: (u) => (
              <span className={`text-xs font-medium ${u.is_active ? 'text-green-600' : 'text-red-600'}`}>
                {u.is_active ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          {
            key: 'id',
            header: 'Actions',
            render: (u) => (
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(u)} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                  <Pencil size={16} />
                </button>
                <button onClick={() => setResetting(u)} className="rounded p-1 text-amber-600 hover:bg-amber-50">
                  <KeyRound size={16} />
                </button>
                {u.id !== currentUser?.id && u.is_active === 1 && (
                  <button onClick={() => setDeactivating(u)} className="rounded p-1 text-red-600 hover:bg-red-50">
                    <UserX size={16} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {loading && users.length === 0 && (
        <p className="text-sm text-gray-500">Loading users...</p>
      )}

      {/* Add User Modal */}
      <FormModal open={showAdd} title="Add User" onClose={() => setShowAdd(false)} onSubmit={handleCreate}>
        <div>
          <label className="label-text mb-1">Username</label>
          <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="label-text mb-1">Full Name</label>
          <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="label-text mb-1">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label-text mb-1">Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" placeholder="Default: changeme123" />
        </div>
      </FormModal>

      {/* Edit User Modal */}
      <FormModal open={!!editing} title="Edit User" onClose={() => setEditing(null)} onSubmit={handleUpdate}>
        <div>
          <label className="label-text mb-1">Username</label>
          <input type="text" value={form.username} disabled className="input-field bg-gray-100" />
        </div>
        <div>
          <label className="label-text mb-1">Full Name</label>
          <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" required />
        </div>
        <div>
          <label className="label-text mb-1">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label-text mb-1">Status</label>
          <select value={form.is_active} onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })} className="input-field">
            <option value={1}>Active</option>
            <option value={0}>Inactive</option>
          </select>
        </div>
      </FormModal>

      {/* Reset Password Modal */}
      <FormModal open={!!resetting} title={`Reset Password: ${resetting?.username}`} onClose={() => setResetting(null)} onSubmit={handleResetPassword}>
        <div>
          <label className="label-text mb-1">New Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" required />
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deactivating?.username}? They will no longer be able to log in.`}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivating(null)}
        destructive
      />
    </div>
  )
}
