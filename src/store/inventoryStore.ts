import { create } from 'zustand'

interface InventoryItem {
  id: number
  item_code: string | null
  name: string
  item_type: string
  current_stock: number
  reorder_level: number
  unit_name: string | null
  unit_short_code: string | null
  category_name: string | null
  is_active: number
  standard_cost: number
  standard_sale_price: number
}

interface InventoryState {
  rawMaterials: InventoryItem[]
  finishedGoods: InventoryItem[]
  loading: boolean
  fetchRawMaterials: (userId: number) => Promise<void>
  fetchFinishedGoods: (userId: number) => Promise<void>
}

export const useInventoryStore = create<InventoryState>((set) => ({
  rawMaterials: [],
  finishedGoods: [],
  loading: false,
  fetchRawMaterials: async (userId) => {
    set({ loading: true })
    try {
      const { api } = await import('../lib/api.js')
      const items = await api.inventory.listItems(userId, { item_type: 'raw_material' })
      set({ rawMaterials: items as InventoryItem[], loading: false })
    } catch {
      set({ loading: false })
    }
  },
  fetchFinishedGoods: async (userId) => {
    set({ loading: true })
    try {
      const { api } = await import('../lib/api.js')
      const items = await api.inventory.listItems(userId, {
        item_type: 'finished_good',
      })
      const fabricated = await api.inventory.listItems(userId, {
        item_type: 'fabricated',
      })
      set({ finishedGoods: [...items, ...fabricated] as InventoryItem[], loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))
