import { create } from 'zustand'

interface VendorState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useVendorStore = create<VendorState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    // TODO: wire to IPC once vendors module is built
    set({ loading: false, items: [] })
  },
}))
