import { create } from 'zustand'

interface InventoryState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useInventoryStore = create<InventoryState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
