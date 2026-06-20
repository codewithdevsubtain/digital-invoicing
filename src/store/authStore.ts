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
const SESSION_TOKEN_KEY = 'hvac_erp_session_token'

interface AuthState {
  user: SafeUser | null
  token: string | null
  loading: boolean
  sessionChecked: boolean
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
  if (remember === 'true') {
    return localStorage.getItem(TOKEN_KEY)
  }
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

function storeToken(token: string, rememberMe: boolean): void {
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(REMEMBER_KEY, 'true')
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
  } else {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.setItem(REMEMBER_KEY, 'false')
  }
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REMEMBER_KEY)
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
}

let sessionLoadPromise: Promise<void> | null = null

async function waitForElectron(maxMs = 8000): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (typeof window.electronAPI?.invoke === 'function') return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  sessionChecked: false,
  error: null,
  forcePasswordChange: false,

  loadSession: async () => {
    if (sessionLoadPromise) return sessionLoadPromise

    sessionLoadPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const electronReady = await waitForElectron()
        if (!electronReady) {
          clearStoredToken()
          set({ user: null, token: null })
          return
        }

        const token = getStoredToken()
        if (!token) {
          set({ user: null, token: null })
          return
        }

        const user = await api.auth.getCurrentUser(token)
        if (user) {
          set({
            user,
            token,
            forcePasswordChange: user.force_password_change === 1,
          })
        } else {
          clearStoredToken()
          set({ user: null, token: null })
        }
      } catch {
        clearStoredToken()
        set({ user: null, token: null })
      } finally {
        set({ loading: false, sessionChecked: true })
        sessionLoadPromise = null
      }
    })()

    return sessionLoadPromise
  },

  login: async (username, password, rememberMe) => {
    set({ loading: true, error: null })
    try {
      const electronReady = await waitForElectron()
      if (!electronReady) {
        throw new Error('Desktop app is not ready. Please use the HVAC ERP window from npm run dev.')
      }

      const result = await api.auth.login(username, password, rememberMe)
      storeToken(result.token, rememberMe)
      set({
        user: result.user,
        token: result.token,
        forcePasswordChange: result.forcePasswordChange,
        sessionChecked: true,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Login failed' })
    } finally {
      set({ loading: false })
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
    clearStoredToken()
    set({ user: null, token: null, forcePasswordChange: false, sessionChecked: true })
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

export function routeKeyFromPath(pathname: string): string {
  const segment = pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
  return segment === '' ? 'dashboard' : segment
}

export function hasAccess(role: UserRole, route: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? []
  if (perms.includes('*')) return true
  return perms.includes(route)
}
