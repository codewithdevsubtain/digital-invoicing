import type { AppSettings, ActivityLog, User, Vendor, VendorLedger, Customer, CustomerLedger, Project, Unit, ItemCategory, Warehouse, ItemWithStock, ItemDetail, StockPerWarehouse, StockLevelRow, StockMovementWithBalance, LowStockItem, StockMovementRow, PurchaseOrderRow, PurchaseOrderDetail, PurchaseInvoiceRow, PurchaseInvoiceDetail, VendorPaymentRow, VendorPaymentDetail, OutstandingInvoice, BOMRow, BOMDetail, BOMCostEstimate, FabricationOrderRow, FabricationOrderDetail, ProjectRow, ProjectMaterialIssuedRow, ProjectMaterialReturnRow, ProjectLaborRow, ProjectProfitability, SalesInvoiceRow, SalesInvoiceDetail, CustomerReceiptRow, ExpenseCategory, Employee, AttendanceSummary, SalaryPreview, PayrollPreviewRow, EmployeeAdvanceRow, SalaryPaymentRow, AttendanceRow, BankAccount, CashAccount, CashBankTransaction, COARow, JournalEntryRow, LedgerRow, TrialBalanceRow, PnLStatement, BalanceSheetData, StockMovement } from './types.js'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

const TOKEN_KEY = 'hvac_erp_token'
const REMEMBER_KEY = 'hvac_erp_remember'
const SESSION_TOKEN_KEY = 'hvac_erp_session_token'

const PUBLIC_CHANNELS = new Set(['auth:login', 'settings:get'])
const TOKEN_PROVIDED_CHANNELS = new Set(['auth:getCurrentUser', 'auth:logout', 'auth:changePassword'])
const IPC_TIMEOUT_MS = 15000

function getStoredAuthToken(): string | null {
  const remember = localStorage.getItem(REMEMBER_KEY)
  if (remember === 'true') {
    return localStorage.getItem(TOKEN_KEY)
  }
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!window.electronAPI?.invoke) {
    throw new Error(
      'Electron API not available. Please use the HVAC ERP desktop window opened by "npm run dev", not a browser tab.'
    )
  }

  const request = PUBLIC_CHANNELS.has(channel) || TOKEN_PROVIDED_CHANNELS.has(channel)
    ? window.electronAPI.invoke(channel, ...args)
    : (() => {
        const token = getStoredAuthToken()
        if (!token) throw new Error('Not authenticated')
        return window.electronAPI.invoke(channel, token, ...args)
      })()

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Request timed out: ${channel}`)), IPC_TIMEOUT_MS)
  })

  try {
    return await Promise.race([request, timeout]) as T
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
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
    changePassword: (userId: number, oldPassword: string, newPassword: string) => {
      const token = getStoredAuthToken()
      if (!token) throw new Error('Not authenticated')
      return invoke<boolean>('auth:changePassword', token, userId, oldPassword, newPassword)
    },
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
    // Units
    listUnits: () => invoke<Unit[]>('inventory:listUnits'),
    createUnit: (userId: number, data: { name: string; short_code: string }) =>
      invoke<{ id: number | bigint }>('inventory:createUnit', userId, data),
    updateUnit: (userId: number, id: number, data: { name?: string; short_code?: string }) =>
      invoke<boolean>('inventory:updateUnit', userId, id, data),
    deleteUnit: (userId: number, id: number) => invoke<boolean>('inventory:deleteUnit', userId, id),

    // Categories
    listCategories: () => invoke<ItemCategory[]>('inventory:listCategories'),
    createCategory: (userId: number, data: { name: string; parent_id?: number | null; item_type?: string | null }) =>
      invoke<{ id: number | bigint }>('inventory:createCategory', userId, data),
    updateCategory: (userId: number, id: number, data: { name?: string; parent_id?: number | null; item_type?: string | null }) =>
      invoke<boolean>('inventory:updateCategory', userId, id, data),
    deleteCategory: (userId: number, id: number) => invoke<boolean>('inventory:deleteCategory', userId, id),

    // Warehouses
    listWarehouses: () => invoke<Warehouse[]>('inventory:listWarehouses'),
    createWarehouse: (userId: number, data: { name: string; location?: string }) =>
      invoke<{ id: number | bigint }>('inventory:createWarehouse', userId, data),
    updateWarehouse: (userId: number, id: number, data: { name?: string; location?: string }) =>
      invoke<boolean>('inventory:updateWarehouse', userId, id, data),
    toggleWarehouse: (userId: number, id: number) =>
      invoke<{ is_active: number }>('inventory:toggleWarehouse', userId, id),

    // Items
    listItems: (userId: number, filters?: { item_type?: string; category_id?: number; search?: string; low_stock_only?: boolean; is_active?: boolean | null }) =>
      invoke<ItemWithStock[]>('inventory:listItems', userId, filters),
    getItem: (userId: number, id: number) =>
      invoke<ItemDetail | null>('inventory:getItem', userId, id),
    createItem: (userId: number, data: { name: string; category_id?: number; item_type: string; unit_id?: number; reorder_level?: number; standard_cost?: number; standard_sale_price?: number; hsn_code?: string; description?: string }) =>
      invoke<{ id: number | bigint; item_code: string }>('inventory:createItem', userId, data),
    updateItem: (userId: number, id: number, data: { name?: string; category_id?: number; item_type?: string; unit_id?: number; reorder_level?: number; standard_cost?: number; standard_sale_price?: number; hsn_code?: string; description?: string }) =>
      invoke<boolean>('inventory:updateItem', userId, id, data),
    toggleItem: (userId: number, id: number) =>
      invoke<{ is_active: number }>('inventory:toggleItem', userId, id),

    // Stock
    getItemStock: (userId: number, itemId: number) =>
      invoke<{ per_warehouse: StockPerWarehouse[]; total: number }>('inventory:getItemStock', userId, itemId),
    getAllStockLevels: (userId: number, filters?: { item_type?: string; warehouse_id?: number; below_reorder_only?: boolean }) =>
      invoke<StockLevelRow[]>('inventory:getAllStockLevels', userId, filters),
    getItemStockHistory: (userId: number, itemId: number, filters?: { warehouse_id?: number; date_from?: string; date_to?: string }) =>
      invoke<StockMovementWithBalance[]>('inventory:getItemStockHistory', userId, itemId, filters),
    adjustStock: (userId: number, data: { item_id: number; warehouse_id: number; quantity: number; type: 'adjustment_in' | 'adjustment_out'; reason?: string; date: string }) =>
      invoke<boolean>('inventory:adjustStock', userId, data),
    getLowStockItems: () => invoke<LowStockItem[]>('inventory:getLowStockItems'),
    listAllStockMovements: (userId: number, filters?: { item_id?: number; warehouse_id?: number; movement_type?: string; date_from?: string; date_to?: string; reference_type?: string }) =>
      invoke<StockMovementRow[]>('inventory:listAllStockMovements', userId, filters),
  },
  purchases: {
    // Purchase Orders
    po: {
      create: (userId: number, data: { vendor_id: number; date: string; notes?: string; items: Array<{ item_id: number; quantity: number; rate: number }> }) =>
        invoke<{ id: number | bigint; po_number: string }>('po:create', userId, data),
      list: (userId: number, filters?: { vendor_id?: number; status?: string; date_from?: string; date_to?: string }) =>
        invoke<PurchaseOrderRow[]>('po:list', userId, filters),
      getById: (userId: number, id: number) =>
        invoke<PurchaseOrderDetail | null>('po:getById', userId, id),
      update: (userId: number, id: number, data: { vendor_id?: number; date?: string; notes?: string; status?: string; items?: Array<{ item_id: number; quantity: number; rate: number }> }) =>
        invoke<boolean>('po:update', userId, id, data),
      updateStatus: (userId: number, id: number, status: string) =>
        invoke<boolean>('po:updateStatus', userId, id, status),
      delete: (userId: number, id: number) => invoke<boolean>('po:delete', userId, id),
    },
    // Purchase Invoices
    pi: {
      create: (userId: number, data: {
        vendor_id: number; vendor_invoice_no?: string; date: string; warehouse_id: number
        purchase_order_id?: number; notes?: string
        discount_percent?: number; gst_percent?: number; withholding_tax_percent?: number; other_charges?: number
        items: Array<{ item_id: number; quantity: number; rate: number; discount_percent?: number; gst_percent?: number }>
      }) => invoke<{ id: number | bigint; invoice_number: string }>('pi:create', userId, data),
      list: (userId: number, filters?: { vendor_id?: number; payment_status?: string; date_from?: string; date_to?: string }) =>
        invoke<PurchaseInvoiceRow[]>('pi:list', userId, filters),
      getById: (userId: number, id: number) =>
        invoke<PurchaseInvoiceDetail | null>('pi:getById', userId, id),
      void: (userId: number, id: number, reason: string) =>
        invoke<boolean>('pi:void', userId, id, reason),
      getOutstanding: (userId: number, vendorId: number) =>
        invoke<OutstandingInvoice[]>('pi:getOutstanding', userId, vendorId),
    },
    // Vendor Payments
    payment: {
      record: (userId: number, data: {
        vendor_id: number; date: string; amount: number
        payment_method: string; bank_account_id?: number; reference_no?: string; notes?: string
        allocations: Array<{ purchase_invoice_id: number; amount: number }>
      }) => invoke<{ id: number | bigint; payment_number: string }>('payment:record', userId, data),
      list: (userId: number, filters?: { vendor_id?: number; date_from?: string; date_to?: string }) =>
        invoke<VendorPaymentRow[]>('payment:list', userId, filters),
      getById: (userId: number, id: number) =>
        invoke<VendorPaymentDetail | null>('payment:getById', userId, id),
    },
  },
  fabrication: {
    bom: {
      create: (userId: number, data: {
        finished_item_id: number; name: string; output_quantity: number
        labor_cost_estimate?: number; overhead_cost_estimate?: number; notes?: string
        components: Array<{ raw_material_item_id: number; quantity_required: number; wastage_percent?: number }>
      }) => invoke<{ id: number | bigint }>('bom:create', userId, data),
      list: (userId: number, filters?: { finished_item_id?: number }) =>
        invoke<BOMRow[]>('bom:list', userId, filters),
      getById: (userId: number, id: number) =>
        invoke<BOMDetail | null>('bom:getById', userId, id),
      update: (userId: number, id: number, data: {
        name?: string; output_quantity?: number
        labor_cost_estimate?: number; overhead_cost_estimate?: number; notes?: string
        components?: Array<{ raw_material_item_id: number; quantity_required: number; wastage_percent?: number }>
      }) => invoke<boolean>('bom:update', userId, id, data),
      deactivate: (userId: number, id: number) =>
        invoke<{ is_active: number }>('bom:deactivate', userId, id),
      costEstimate: (userId: number, id: number) =>
        invoke<BOMCostEstimate>('bom:costEstimate', userId, id),
    },
    fab: {
      create: (userId: number, data: { bom_id: number; quantity_to_produce: number; warehouse_id: number; date_started?: string; notes?: string }) =>
        invoke<{ id: number | bigint; fab_order_number: string }>('fab:create', userId, data),
      list: (userId: number, filters?: { status?: string; date_from?: string; date_to?: string; finished_item_id?: number }) =>
        invoke<FabricationOrderRow[]>('fab:list', userId, filters),
      getById: (userId: number, id: number) =>
        invoke<FabricationOrderDetail | null>('fab:getById', userId, id),
      start: (userId: number, id: number, overrideLowStock?: boolean) =>
        invoke<{ success?: boolean; error?: string; details?: string[] }>('fab:start', userId, id, overrideLowStock),
      complete: (userId: number, id: number, data: { quantity_produced: number; actual_labor_cost?: number; actual_overhead_cost?: number; materials?: Array<{ id: number; quantity_consumed: number }> }) =>
        invoke<{ total_fabrication_cost: number; cost_per_unit: number }>('fab:complete', userId, id, data),
      cancel: (userId: number, id: number) => invoke<boolean>('fab:cancel', userId, id),
    },
  },
  projects: {
    list: (userId: number, filters?: { customer_id?: number; status?: string; search?: string; date_from?: string; date_to?: string }) =>
      invoke<ProjectRow[]>('projects:list', userId, filters),
    get: (userId: number, id: number) =>
      invoke<(Project & { customer_name: string | null }) | null>('projects:get', userId, id),
    create: (userId: number, data: {
      project_name: string; customer_id?: number; site_address?: string; description?: string
      start_date?: string; expected_end_date?: string; contract_value?: number; status?: string
    }) => invoke<{ id: number | bigint; project_code: string }>('projects:create', userId, data),
    update: (userId: number, id: number, data: Record<string, unknown>) => invoke<boolean>('projects:update', userId, id, data),
    updateStatus: (userId: number, id: number, status: string) => invoke<boolean>('projects:updateStatus', userId, id, status),

    // Materials
    issueMaterial: (userId: number, data: {
      project_id: number; item_id: number; warehouse_id: number; quantity: number
      date: string; issued_to?: string; notes?: string; override_low_stock?: boolean
    }) => invoke<{ success?: boolean; error?: string; message?: string; unit_cost?: number; total_cost?: number }>('projects:issueMaterial', userId, data),
    returnMaterial: (userId: number, data: {
      project_id: number; item_id: number; warehouse_id: number; quantity: number; date: string; notes?: string
    }) => invoke<boolean>('projects:returnMaterial', userId, data),
    getMaterials: (userId: number, projectId: number) =>
      invoke<{ issued: ProjectMaterialIssuedRow[]; returns: ProjectMaterialReturnRow[]; issued_total: number; net_cost: number }>('projects:getMaterials', userId, projectId),

    // Labor
    addLaborCost: (userId: number, data: {
      project_id: number; employee_id?: number; date: string
      hours_worked?: number; rate_per_hour?: number; daily_wage_amount?: number; description?: string
    }) => invoke<{ id: number | bigint }>('projects:addLaborCost', userId, data),
    getLaborCosts: (userId: number, projectId: number) =>
      invoke<{ rows: ProjectLaborRow[]; total: number }>('projects:getLaborCosts', userId, projectId),

    // Expenses
    addExpense: (userId: number, data: {
      project_id: number; expense_category: string; description?: string; amount: number; date: string
      paid_via?: string; bank_account_id?: number
    }) => invoke<{ id: number | bigint }>('projects:addExpense', userId, data),
    getExpenses: (userId: number, projectId: number) =>
      invoke<{ rows: any[]; total: number }>('projects:getExpenses', userId, projectId),

    // Profitability
    profitability: (userId: number, projectId: number) =>
      invoke<ProjectProfitability>('projects:profitability', userId, projectId),
    summary: (userId: number) =>
      invoke<{ active_projects: number; total_contract_value: number; total_revenue_invoiced: number }>('projects:summary', userId),
  },
  sales: {
    list: (userId: number, filters?: { customer_id?: number; project_id?: number; payment_status?: string; date_from?: string; date_to?: string }) =>
      invoke<SalesInvoiceRow[]>('sales:list', userId, filters),
    getById: (userId: number, id: number) =>
      invoke<SalesInvoiceDetail | null>('sales:getById', userId, id),
    create: (userId: number, data: {
      customer_id: number; project_id?: number; date: string
      discount_percent?: number; discount_amount?: number
      further_tax_percent?: number; withholding_tax_percent?: number; notes?: string
      items: Array<{
        item_id?: number; description: string; quantity: number; unit?: string; rate: number; gst_percent?: number
      }>
    }) => invoke<{ id: number | bigint; invoice_number: string; grand_total: number; withholding_tax_amount: number }>('sales:create', userId, data),
    void: (userId: number, id: number, reason: string) =>
      invoke<boolean>('sales:void', userId, id, reason),
    projectMaterials: (userId: number, projectId: number) =>
      invoke<Array<{ item_id: number; quantity_issued: number; unit_cost: number; item_name: string; item_code: string | null; unit_short_code: string | null }>>('sales:projectMaterials', userId, projectId),
  },
  receipts: {
    record: (userId: number, data: {
      customer_id: number; sales_invoice_id: number; date: string; amount: number
      payment_method: string; bank_account_id?: number; reference_no?: string; notes?: string
      withholding_tax_deducted?: number
    }) => invoke<{ id: number | bigint; receipt_number: string }>('receipt:record', userId, data),
    list: (userId: number, filters?: { customer_id?: number; sales_invoice_id?: number; date_from?: string; date_to?: string }) =>
      invoke<CustomerReceiptRow[]>('receipt:list', userId, filters),
  },
  expenses: {
    categories: {
      list: () => invoke<(ExpenseCategory & { account_code: string | null; account_name: string | null })[]>('expenses:categories:list'),
      create: (userId: number, data: { name: string; type: string; account_id?: number }) =>
        invoke<{ id: number | bigint }>('expenses:categories:create', userId, data),
      update: (userId: number, id: number, data: { name?: string; type?: string; account_id?: number | null }) =>
        invoke<boolean>('expenses:categories:update', userId, id, data),
    },
    list: (userId: number, filters?: { category_id?: number; date_from?: string; date_to?: string; paid_via?: string }) =>
      invoke<(any)[]>('expenses:list', userId, filters),
    get: (userId: number, id: number) => invoke<any | null>('expenses:get', userId, id),
    create: (userId: number, data: {
      category_id: number; description?: string; amount: number; date: string; paid_via: string; bank_account_id?: number
    }) => invoke<{ id: number | bigint; expense_number: string }>('expenses:create', userId, data),
    update: (userId: number, id: number, data: {
      category_id?: number; description?: string; amount?: number; date?: string; paid_via?: string; bank_account_id?: number | null
    }) => invoke<boolean>('expenses:update', userId, id, data),
    delete: (userId: number, id: number) => invoke<boolean>('expenses:delete', userId, id),
    summary: (userId: number, data?: { date_from?: string; date_to?: string }) =>
      invoke<{ total: number; by_category: Array<{ id: number; name: string; type: string; total: number }> }>('expenses:summary', userId, data),
  },
  cashbank: {
    bank: {
      list: () => invoke<BankAccount[]>('cashbank:bank:list'),
      create: (userId: number, data: { account_name: string; bank_name?: string; account_number?: string; branch?: string; opening_balance?: number }) =>
        invoke<{ id: number | bigint }>('cashbank:bank:create', userId, data),
      update: (userId: number, id: number, data: Record<string, unknown>) => invoke<boolean>('cashbank:bank:update', userId, id, data),
      toggleActive: (userId: number, id: number) => invoke<{ is_active: number }>('cashbank:bank:toggleActive', userId, id),
    },
    cash: {
      list: () => invoke<CashAccount[]>('cashbank:cash:list'),
      create: (userId: number, data: { account_name: string; opening_balance?: number }) =>
        invoke<{ id: number | bigint }>('cashbank:cash:create', userId, data),
      update: (userId: number, id: number, data: Record<string, unknown>) => invoke<boolean>('cashbank:cash:update', userId, id, data),
      toggleActive: (userId: number, id: number) => invoke<{ is_active: number }>('cashbank:cash:toggleActive', userId, id),
    },
    transactions: (userId: number, data: { account_type: string; account_id: number; date_from?: string; date_to?: string }) =>
      invoke<CashBankTransaction[]>('cashbank:transactions', userId, data),
    balances: () => invoke<{
      cash: CashAccount[]; bank: BankAccount[]; total_cash_position: number
    }>('cashbank:balances'),
    manualTransaction: (userId: number, data: {
      account_type: string; account_id: number; date: string; transaction_type: string
      amount: number; description?: string; category?: string
    }) => invoke<boolean>('cashbank:manualTransaction', userId, data),
    transfer: (userId: number, data: {
      from_type: string; from_id: number; to_type: string; to_id: number
      amount: number; date: string; description?: string
    }) => invoke<boolean>('cashbank:transfer', userId, data),
  },
  accounting: {
    coa: {
      list: () => invoke<COARow[]>('acc:coa:list'),
      create: (userId: number, data: { account_code: string; account_name: string; account_type: string; parent_id?: number }) =>
        invoke<{ id: number | bigint }>('acc:coa:create', userId, data),
      update: (userId: number, id: number, data: { account_name?: string; account_type?: string; parent_id?: number | null }) =>
        invoke<boolean>('acc:coa:update', userId, id, data),
      toggleActive: (userId: number, id: number) => invoke<{ is_active: number }>('acc:coa:toggleActive', userId, id),
    },
    journal: {
      list: (userId: number, filters?: { date_from?: string; date_to?: string; account_id?: number; reference_type?: string }) =>
        invoke<JournalEntryRow[]>('acc:journal:list', userId, filters),
      create: (userId: number, data: { date: string; description: string; lines: Array<{ account_id: number; debit: number; credit: number; description?: string }> }) =>
        invoke<{ id: number | bigint; entry_number: string }>('acc:journal:create', userId, data),
    },
    ledger: (userId: number, data: { account_id: number; date_from?: string; date_to?: string }) =>
      invoke<LedgerRow[]>('acc:ledger', userId, data),
    trialBalance: (userId: number, asOfDate: string) =>
      invoke<{ rows: TrialBalanceRow[]; total_debit: number; total_credit: number }>('acc:trialBalance', userId, asOfDate),
    pnl: (userId: number, data: { date_from: string; date_to: string }) =>
      invoke<PnLStatement>('acc:pnl', userId, data),
    balanceSheet: (userId: number, asOfDate: string) =>
      invoke<BalanceSheetData>('acc:balanceSheet', userId, asOfDate),
  },
  hr: {
    employees: {
      list: (userId: number, filters?: { designation?: string; is_active?: boolean | null }) =>
        invoke<Employee[]>('hr:employees:list', userId, filters),
      get: (userId: number, id: number) => invoke<Employee | null>('hr:employees:get', userId, id),
      create: (userId: number, data: {
        full_name: string; designation: string; phone?: string; cnic?: string; address?: string
        joining_date?: string; salary_type: string; monthly_salary?: number; daily_rate?: number
      }) => invoke<{ id: number | bigint; employee_code: string }>('hr:employees:create', userId, data),
      update: (userId: number, id: number, data: Record<string, unknown>) => invoke<boolean>('hr:employees:update', userId, id, data),
      toggleActive: (userId: number, id: number) => invoke<{ is_active: number }>('hr:employees:toggleActive', userId, id),
    },
    attendance: {
      mark: (userId: number, data: { employee_id: number; date: string; status: string; overtime_hours?: number; notes?: string }) =>
        invoke<boolean>('hr:attendance:mark', userId, data),
      bulkMark: (userId: number, data: { date: string; entries: Array<{ employee_id: number; status: string; overtime_hours?: number }> }) =>
        invoke<boolean>('hr:attendance:bulkMark', userId, data),
      list: (userId: number, filters: { employee_id?: number; date_from?: string; date_to?: string }) =>
        invoke<AttendanceRow[]>('hr:attendance:list', userId, filters),
      summary: (userId: number, data: { employee_id: number; month: string; year: number }) =>
        invoke<AttendanceSummary>('hr:attendance:summary', userId, data),
    },
    salary: {
      preview: (userId: number, data: { employee_id: number; month: string; year: number }) =>
        invoke<SalaryPreview>('hr:salary:preview', userId, data),
      create: (userId: number, data: {
        employee_id: number; month: string; year: number; basic_salary: number; days_present: number
        overtime_amount: number; deductions: number; advance_deduction: number; net_salary: number
        payment_date: string; paid_via: string; bank_account_id?: number
      }) => invoke<{ id: number | bigint }>('hr:salary:create', userId, data),
      list: (userId: number, filters?: { employee_id?: number; month?: string; year?: number }) =>
        invoke<SalaryPaymentRow[]>('hr:salary:list', userId, filters),
    },
    payroll: {
      preview: (userId: number, data: { month: string; year: number }) =>
        invoke<PayrollPreviewRow[]>('hr:payroll:preview', userId, data),
    },
    advances: {
      give: (userId: number, data: { employee_id: number; date: string; amount: number; reason?: string }) =>
        invoke<{ id: number | bigint }>('hr:advances:give', userId, data),
      list: (userId: number, filters?: { employee_id?: number; status?: string }) =>
        invoke<EmployeeAdvanceRow[]>('hr:advances:list', userId, filters),
    },
  },
  reports: {
    projectProfitability: (userId: number, filters?: { date_from?: string; date_to?: string; status?: string }) =>
      invoke<{ rows: any[]; totals: any }>('reports:projectProfitability', userId, filters),
    receivablesAging: (userId: number, asOfDate: string) =>
      invoke<Array<{ id: number; name: string; total_outstanding: number; current: number; age31_60: number; age61_90: number; age90plus: number }>>('reports:receivablesAging', userId, asOfDate),
    payablesAging: (userId: number, asOfDate: string) =>
      invoke<Array<{ id: number; name: string; total_outstanding: number; current: number; age31_60: number; age61_90: number; age90plus: number }>>('reports:payablesAging', userId, asOfDate),
    inventoryValuation: (userId: number, asOfDate: string, warehouse_id?: number) =>
      invoke<{ rows: Array<{ id: number; item_code: string; name: string; item_type: string; category_name: string | null; quantity: number; avg_cost: number; total_value: number }>; grand_total: number }>('reports:inventoryValuation', userId, asOfDate, warehouse_id),
    movement: (userId: number, filters: { item_id?: number; date_from: string; date_to: string }) =>
      invoke<StockMovement[]>('reports:movement', userId, filters),
    lowStock: () => invoke<any[]>('reports:lowStock'),
    salesTax: (userId: number, data: { date_from: string; date_to: string }) =>
      invoke<{ rows: Array<{ month: string; total_sales: number; gst_collected: number; further_tax: number; total_output_tax: number; total_purchases: number; gst_paid: number; net_payable: number }>; totals: { total_sales: number; total_output_tax: number; total_purchases: number; total_input_tax: number; net_payable: number } }>('reports:salesTax', userId, data),
    wht: (userId: number, data: { date_from: string; date_to: string }) =>
      invoke<{ rows: Array<{ month: string; wht_receivable: number; wht_payable: number; net_position: number }> }>('reports:wht', userId, data),
    expenseBreakdown: (userId: number, data: { date_from: string; date_to: string }) =>
      invoke<{ rows: Array<{ category: string; type: string; total: number; pct: number }>; grand_total: number }>('reports:expenseBreakdown', userId, data),
    employeeCost: (userId: number, data: { month: string; year: number }) =>
      invoke<Array<{ employee_id: number; employee_name: string; designation: string; salary: number; project_labor: number; total_cost: number }>>('reports:employeeCost', userId, data),
    dashboard: (userId: number, data?: { date_from?: string; date_to?: string }) =>
      invoke<any>('reports:dashboard', userId, data),
    exportCSV: (userId: number, data: { defaultName: string; headers: string[]; rows: string[][] }) =>
      invoke<boolean>('reports:exportCSV', userId, data),
  },
  app: {
    backup: (userId: number) => invoke<{ success: boolean; path?: string; error?: string }>('app:backup', userId),
    restore: (userId: number, confirmed: boolean) =>
      invoke<{ success: boolean; error?: string }>('app:restore', userId, confirmed),
    settingsPath: (userId: number) =>
      invoke<{ userData: string; backups: string; version: string }>('app:settingsPath', userId),
  },
}
