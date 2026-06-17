import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Lock, User, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import Loading from '../../components/Loading.js'

export default function Login() {
  const navigate = useNavigate()
  const { user, loading, error, login, loadSession, clearError, forcePasswordChange } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changeError, setChangeError] = useState<string | null>(null)

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (user) {
      if (forcePasswordChange) {
        setShowChangePassword(true)
      } else {
        navigate('/')
      }
    }
  }, [user, forcePasswordChange, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    await login(username, password, rememberMe)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangeError(null)
    if (newPassword !== confirmPassword) {
      setChangeError('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setChangeError('Password must be at least 6 characters')
      return
    }
    try {
      await useAuthStore.getState().changePassword(oldPassword, newPassword)
      navigate('/')
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Failed to change password')
    }
  }

  if (loading && !showChangePassword) {
    return <Loading fullScreen text="Starting HVAC ERP..." />
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-navy-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
            <Factory size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">HVAC ERP</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {showChangePassword ? (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
              You must change the default password before continuing.
            </div>
            {changeError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={16} />
                {changeError}
              </div>
            )}
            <div>
              <label className="label-text mb-1">Current Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label-text mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label-text mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              Update Password
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <div>
              <label className="label-text mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="label-text mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-navy-800 focus:ring-navy-600"
                />
                Remember me
              </label>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="text-center text-xs text-gray-400">Default: admin / admin123</p>
          </form>
        )}
      </div>
    </div>
  )
}
