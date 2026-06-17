import { create } from 'zustand'

interface CustomerState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useCustomerStore = create<CustomerState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
