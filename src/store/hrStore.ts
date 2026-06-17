import { create } from 'zustand'

interface HRState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useHRStore = create<HRState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
