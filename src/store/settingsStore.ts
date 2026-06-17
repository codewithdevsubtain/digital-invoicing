import { create } from 'zustand'
import { api } from '../lib/api.js'
import { useAuthStore } from './authStore.js'

function getCurrentUserId(): number | null {
  return useAuthStore.getState().user?.id ?? null
}

export interface AppSettings {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_ntn: string
  company_strn: string
  company_logo: string
  default_gst_percent: string
  default_wht_percent: string
  currency_symbol: string
  financial_year_start_month: string
  app_theme: string
}

const defaultSettings: AppSettings = {
  company_name: 'HVAC ERP',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_ntn: '',
  company_strn: '',
  company_logo: '',
  default_gst_percent: '18',
  default_wht_percent: '4.5',
  currency_symbol: 'PKR',
  financial_year_start_month: '7',
  app_theme: 'light',
}

interface SettingsState {
  settings: AppSettings
  loading: boolean
  saving: boolean
  loadSettings: () => Promise<void>
  saveSettings: (values: Partial<AppSettings>) => Promise<void>
  uploadLogo: (base64: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  loading: false,
  saving: false,

  loadSettings: async () => {
    set({ loading: true })
    try {
      const data = await api.settings.get()
      set({ settings: { ...defaultSettings, ...data }, loading: false })
    } catch (err) {
      console.error('Failed to load settings:', err)
      set({ loading: false })
    }
  },

  saveSettings: async (values) => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not authenticated')
    set({ saving: true })
    try {
      const data = await api.settings.save(userId, values)
      set({ settings: { ...defaultSettings, ...data }, saving: false })
    } catch (err) {
      console.error('Failed to save settings:', err)
      set({ saving: false })
      throw err
    }
  },

  uploadLogo: async (base64) => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not authenticated')
    await api.settings.uploadLogo(userId, base64)
    set({ settings: { ...get().settings, company_logo: base64 } })
  },
}))
