import { useEffect, useState } from 'react'
import { Download, Upload, Info, HardDrive } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'

export default function DataManagementTab() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [appInfo, setAppInfo] = useState<{ userData: string; backups: string; version: string } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    if (!user) return
    api.app.settingsPath(user.id).then(setAppInfo).catch(() => {})
  }, [user])

  const handleBackup = async () => {
    if (!user) return
    setBackingUp(true)
    try {
      const r = await api.app.backup(user.id)
      if (r.success) {
        addToast({ type: 'success', title: 'Backup Created', message: `Saved to ${r.path}` })
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Backup Failed', message: err.message ?? 'Unknown error' })
    } finally { setBackingUp(false) }
  }

  const handleRestore = async () => {
    if (!user) return
    const confirmed = window.confirm('WARNING: This will REPLACE ALL current data with the backup. This cannot be undone. Are you sure?')
    if (!confirmed) return
    const confirmed2 = window.confirm('Final confirmation: Restore database from backup? The application will restart automatically.')
    if (!confirmed2) return
    setRestoring(true)
    try {
      const r = await api.app.restore(user.id, true)
      if (r.success) {
        addToast({ type: 'success', title: 'Restoring', message: 'App will restart...' })
      } else if (!r.error?.includes('confirm')) {
        addToast({ type: 'error', title: 'Restore Failed', message: r.error ?? 'Unknown' })
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Restore Failed', message: err.message ?? 'Unknown' })
    } finally { setRestoring(false) }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><HardDrive size={20} /> Data Management</h3>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <Download size={20} className="text-green-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900">Backup Database</h4>
                <p className="text-xs text-gray-500">Save a copy of all data</p>
              </div>
            </div>
            <button onClick={handleBackup} disabled={backingUp} className="btn-primary w-full justify-center">
              {backingUp ? 'Backing up...' : 'Create Backup'}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <Upload size={20} className="text-red-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900">Restore Database</h4>
                <p className="text-xs text-gray-500">Replace all data from a backup</p>
              </div>
            </div>
            <button onClick={handleRestore} disabled={restoring} className="btn-secondary w-full justify-center border-red-300 text-red-600 hover:bg-red-50">
              {restoring ? 'Restoring...' : 'Restore from Backup'}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Info size={20} /> System Information</h3>
        <div className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-gray-500">App Version</span><span>{appInfo?.version ?? '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Data Storage Location</span><span className="text-xs font-mono">{appInfo?.userData ?? '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Backups Directory</span><span className="text-xs font-mono">{appInfo?.backups ?? '-'}</span></div>
        </div>
      </div>
    </div>
  )
}
