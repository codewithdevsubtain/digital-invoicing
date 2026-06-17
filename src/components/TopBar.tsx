import { useEffect, useState } from 'react'
import { Plus, ChevronDown, LogOut, UserCircle } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore.js'
import { useAuthStore } from '../store/authStore.js'

export default function TopBar() {
  const [currentDate, setCurrentDate] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { settings, loadSettings } = useSettingsStore()
  const { user, logout } = useAuthStore()

  useEffect(() => {
    loadSettings()
    const formatter = new Intl.DateTimeFormat('en-PK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    setCurrentDate(formatter.format(new Date()))
  }, [loadSettings])

  const quickActions = [
    'New Invoice',
    'New Purchase',
    'New Expense',
    'New Project',
    'New Vendor',
    'New Customer',
  ]

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-navy-900">
          {settings.company_name || 'HVAC ERP'}
        </h1>
        <p className="text-xs text-gray-500">{currentDate}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="btn-primary gap-2"
          >
            <Plus size={16} />
            <span>New</span>
            <ChevronDown size={16} />
          </button>
          {showDropdown && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => setShowDropdown(false)}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  {action}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <UserCircle size={18} className="text-navy-700" />
            <span>{user?.full_name ?? user?.username}</span>
            <ChevronDown size={14} />
          </button>
          {showUserMenu && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
              <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                Role: <span className="font-medium capitalize">{user?.role}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
