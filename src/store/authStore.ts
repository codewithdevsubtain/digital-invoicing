import { create } from 'zustand'
import { api } from '../lib/api.js'

export type UserRole = 'admin' | 'accountant' | 'storekeeper' | 'technician' | 'viewer'

interface SafeUser {
  id: number
  username: string
  full_name: string
  role: UserRole
  force_password_change: number
  is_active: number
  created_at: string
  updated_at: string
}

const TOKEN_KEY = 'hvac_erp_token'
const REMEMBER_KEY = 'hvac_erp_remember'

interface AuthState {
  user: SafeUser | null
  token: string | null
  loading: boolean
  error: string | null
  forcePasswordChange: boolean

  loadSession: () => Promise<void>
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>
  logout: () => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  clearError: () => void
}

function getStoredToken(): string | null {
  const remember = localStorage.getItem(REMEMBER_KEY)
  if (remember !== 'true') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REMEMBER_KEY)
    return null
  }
  return localStorage.getItem(TOKEN_KEY)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  forcePasswordChange: false,

  loadSession: async () => {
    const token = getStoredToken()
    if (!token) {
      set({ loading: false })
      return
    }
    set({ loading: true })
    try {
      const user = await api.auth.getCurrentUser(token)
      if (user) {
        set({ user, token, loading: false, forcePasswordChange: user.force_password_change === 1 })
      } else {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REMEMBER_KEY)
        set({ user: null, token: null, loading: false })
      }
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REMEMBER_KEY)
      set({ user: null, token: null, loading: false, error: 'Session expired' })
    }
  },

  login: async (username, password, rememberMe) => {
    set({ loading: true, error: null })
    try {
      const result = await api.auth.login(username, password, rememberMe)
      if (rememberMe) {
        localStorage.setItem(TOKEN_KEY, result.token)
        localStorage.setItem(REMEMBER_KEY, 'true')
      } else {
        localStorage.setItem(TOKEN_KEY, result.token)
        localStorage.setItem(REMEMBER_KEY, 'false')
      }
      set({
        user: result.user,
        token: result.token,
        loading: false,
        forcePasswordChange: result.forcePasswordChange,
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Login failed' })
    }
  },

  logout: async () => {
    const token = get().token
    if (token) {
      try {
        await api.auth.logout(token)
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REMEMBER_KEY)
    set({ user: null, token: null, forcePasswordChange: false })
  },

  changePassword: async (oldPassword, newPassword) => {
    const { user, token } = get()
    if (!user || !token) throw new Error('Not authenticated')
    await api.auth.changePassword(user.id, oldPassword, newPassword)
    set({ forcePasswordChange: false })
  },

  clearError: () => set({ error: null }),
}))

// Role-based access helpers
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['*'],
  accountant: [
    'dashboard',
    'vendors',
    'customers',
    'purchases',
    'invoices',
    'expenses',
    'cash-bank',
    'accounting',
    'reports',
  ],
  storekeeper: [
    'dashboard',
    'raw-materials',
    'finished-goods',
    'stock-movements',
    'fabrication',
    'purchases',
  ],
  technician: ['dashboard', 'projects', 'hr-payroll'],
  viewer: ['dashboard', 'reports'],
}

export function hasAccess(role: UserRole, route: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? []
  if (perms.includes('*')) return true
  return perms.includes(route)
}
