import { create } from 'zustand'

interface AccountingState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useAccountingStore = create<AccountingState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
