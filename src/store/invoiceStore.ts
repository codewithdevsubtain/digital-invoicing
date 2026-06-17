import { create } from 'zustand'

interface InvoiceState {
  items: unknown[]
  loading: boolean
  fetch: () => Promise<void>
}

export const useInvoiceStore = create<InvoiceState>((set) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    set({ loading: false, items: [] })
  },
}))
