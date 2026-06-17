import { create } from 'zustand'

interface ProjectState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
