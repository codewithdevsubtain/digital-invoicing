import type { AppSettings, ActivityLog, User, Vendor, VendorLedger, Customer, CustomerLedger, Project } from './types.js'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!window.electronAPI) {
    throw new Error('Electron API not available')
  }
  return window.electronAPI.invoke(channel, ...args) as Promise<T>
}

export const api = {
  auth: {
    login: (username: string, password: string, rememberMe: boolean) =>
      invoke<{ user: Omit<User, 'password_hash'>; token: string; forcePasswordChange: boolean }>(
        'auth:login',
        username,
        password,
        rememberMe
      ),
    getCurrentUser: (token: string) => invoke<Omit<User, 'password_hash'> | null>('auth:getCurrentUser', token),
    logout: (token: string) => invoke<boolean>('auth:logout', token),
    changePassword: (userId: number, oldPassword: string, newPassword: string) =>
      invoke<boolean>('auth:changePassword', userId, oldPassword, newPassword),
  },
  users: {
    list: (userId: number) => invoke<Omit<User, 'password_hash'>[]>('users:list', userId),
    get: (userId: number, id: number) => invoke<Omit<User, 'password_hash'> | null>('users:get', userId, id),
    create: (userId: number, data: { username: string; password: string; full_name: string; role: string }) =>
      invoke<{ id: number | bigint }>('users:create', userId, data),
    update: (userId: number, id: number, data: { full_name?: string; role?: string; is_active?: number }) =>
      invoke<boolean>('users:update', userId, id, data),
    deactivate: (userId: number, id: number) => invoke<boolean>('users:deactivate', userId, id),
    resetPassword: (userId: number, id: number, newPassword: string) =>
      invoke<boolean>('users:resetPassword', userId, id, newPassword),
  },
  activityLog: {
    list: (
      userId: number,
      filters?: { userId?: number; module?: string; from?: string; to?: string; limit?: number }
    ) => invoke<ActivityLog[]>('activityLog:list', userId, filters),
  },
  vendors: {
    list: (userId: number, filters?: { search?: string; isActive?: boolean | null }) =>
      invoke<(Vendor & { current_balance: number })[]>('vendors:list', userId, filters),
    get: (userId: number, id: number) => invoke<(Vendor & { current_balance: number }) | null>('vendors:get', userId, id),
    create: (
      userId: number,
      data: {
        name: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => invoke<{ id: number | bigint }>('vendors:create', userId, data),
    update: (
      userId: number,
      id: number,
      data: {
        name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => invoke<boolean>('vendors:update', userId, id, data),
    toggleActive: (userId: number, id: number) =>
      invoke<{ is_active: number }>('vendors:toggleActive', userId, id),
    ledger: (userId: number, id: number, filters?: { dateFrom?: string; dateTo?: string }) =>
      invoke<(VendorLedger & { running_balance: number; reference_no?: string | null })[]>('vendors:ledger', userId, id, filters),
    balance: (userId: number, id: number) => invoke<number>('vendors:balance', userId, id),
    summary: (userId: number) => invoke<{ totalPayables: number; outstandingCount: number }>('vendors:summary', userId),
  },
  settings: {
    get: () => invoke<Partial<AppSettings>>('settings:get'),
    save: (userId: number, settings: Partial<AppSettings>) =>
      invoke<Partial<AppSettings>>('settings:save', userId, settings),
    uploadLogo: (userId: number, base64: string) => invoke<string>('settings:logo:upload', userId, base64),
  },
  customers: {
    list: (userId: number, filters?: { search?: string; isActive?: boolean | null }) =>
      invoke<(Customer & { current_balance: number; active_projects_count: number })[]>('customers:list', userId, filters),
    get: (userId: number, id: number) => invoke<(Customer & { current_balance: number }) | null>('customers:get', userId, id),
    create: (
      userId: number,
      data: {
        name: string
        company_name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        strn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => invoke<{ id: number | bigint }>('customers:create', userId, data),
    update: (
      userId: number,
      id: number,
      data: {
        name?: string
        company_name?: string
        contact_person?: string
        phone?: string
        email?: string
        address?: string
        ntn?: string
        strn?: string
        opening_balance?: number
        opening_balance_type?: 'debit' | 'credit'
        is_active?: number
      }
    ) => invoke<boolean>('customers:update', userId, id, data),
    toggleActive: (userId: number, id: number) => invoke<{ is_active: number }>('customers:toggleActive', userId, id),
    ledger: (userId: number, id: number, filters?: { dateFrom?: string; dateTo?: string }) =>
      invoke<(CustomerLedger & { running_balance: number; reference_no?: string | null })[]>('customers:ledger', userId, id, filters),
    balance: (userId: number, id: number) => invoke<number>('customers:balance', userId, id),
    summary: (userId: number) =>
      invoke<{ totalReceivables: number; customersWithBalance: number; overdueCount: number }>('customers:summary', userId),
    projects: (userId: number, id: number) => invoke<Project[]>('customers:projects', userId, id),
  },
  inventory: {
    list: () => invoke<unknown[]>('inventory:list'),
    get: (id: number) => invoke<unknown | null>('inventory:get', id),
    create: (data: unknown) => invoke<unknown>('inventory:create', data),
    update: (id: number, data: unknown) => invoke<unknown>('inventory:update', id, data),
    delete: (id: number) => invoke<unknown>('inventory:delete', id),
  },
  projects: {
    list: () => invoke<unknown[]>('projects:list'),
    get: (id: number) => invoke<unknown | null>('projects:get', id),
    create: (data: unknown) => invoke<unknown>('projects:create', data),
    update: (id: number, data: unknown) => invoke<unknown>('projects:update', id, data),
    delete: (id: number) => invoke<unknown>('projects:delete', id),
  },
  invoices: {
    list: () => invoke<unknown[]>('invoices:list'),
    get: (id: number) => invoke<unknown | null>('invoices:get', id),
    create: (data: unknown) => invoke<unknown>('invoices:create', data),
    update: (id: number, data: unknown) => invoke<unknown>('invoices:update', id, data),
    delete: (id: number) => invoke<unknown>('invoices:delete', id),
  },
  accounting: {
    list: () => invoke<unknown[]>('accounting:list'),
    get: (id: number) => invoke<unknown | null>('accounting:get', id),
    create: (data: unknown) => invoke<unknown>('accounting:create', data),
    update: (id: number, data: unknown) => invoke<unknown>('accounting:update', id, data),
    delete: (id: number) => invoke<unknown>('accounting:delete', id),
  },
  hr: {
    list: () => invoke<unknown[]>('hr:list'),
    get: (id: number) => invoke<unknown | null>('hr:get', id),
    create: (data: unknown) => invoke<unknown>('hr:create', data),
    update: (id: number, data: unknown) => invoke<unknown>('hr:update', id, data),
    delete: (id: number) => invoke<unknown>('hr:delete', id),
  },
  reports: {
    run: (name: string, params?: Record<string, unknown>) => invoke<unknown>('reports:run', name, params),
  },
}
