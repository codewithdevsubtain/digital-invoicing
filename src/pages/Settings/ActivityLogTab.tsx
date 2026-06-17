import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import type { ActivityLog, User } from '../../lib/types.js'

type LogRow = ActivityLog & { username?: string; full_name?: string }

export default function ActivityLogTab() {
  const { user: currentUser } = useAuthStore()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [users, setUsers] = useState<Omit<User, 'password_hash'>[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    userId: '',
    module: '',
    from: '',
    to: '',
  })

  const loadLogs = async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      const data = await api.activityLog.list(currentUser.id, {
        userId: filters.userId ? Number(filters.userId) : undefined,
        module: filters.module || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: 200,
      })
      setLogs(data as LogRow[])
    } catch (err) {
      console.error('Failed to load activity log', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    if (!currentUser) return
    try {
      const data = await api.users.list(currentUser.id)
      setUsers(data)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadUsers()
    loadLogs()
  }, [currentUser])

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <label className="label-text mb-1">User</label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              className="input-field"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text mb-1">Module</label>
            <input
              type="text"
              value={filters.module}
              onChange={(e) => setFilters({ ...filters, module: e.target.value })}
              placeholder="e.g. settings"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text mb-1">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="flex items-end">
            <button onClick={loadLogs} className="btn-secondary gap-2">
              <Search size={16} />
              Search
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">User</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Module</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Record</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  {loading ? 'Loading...' : 'No activity records found.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {new Date(log.timestamp).toLocaleString('en-PK')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {log.full_name || log.username || `User #${log.user_id}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{log.action}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{log.module}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{log.record_id ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{log.details ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
