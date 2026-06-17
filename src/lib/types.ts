// =====================================================================
// SETTINGS & APP CONFIG
// =====================================================================
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
  schema_version?: string
}

// =====================================================================
// USERS & AUTH
// =====================================================================
export type UserRole = 'admin' | 'accountant' | 'storekeeper' | 'technician' | 'viewer'

export interface User {
  id: number
  username: string
  password_hash: string
  full_name: string
  role: UserRole
  force_password_change: number
  is_active: number
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: number
  user_id: number | null
  action: string
  module: string | null
  record_id: number | null
  details: string | null
  timestamp: string
}

// =====================================================================
// VENDORS
// =====================================================================
export type BalanceType = 'debit' | 'credit'
export type VendorTransactionType = 'purchase' | 'payment' | 'debit_note' | 'credit_note' | 'opening_balance'

export interface Vendor {
  id: number
  vendor_code: string | null
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  ntn: string | null
  opening_balance: number
  opening_balance_type: BalanceType
  is_active: number
  created_at: string
}

export interface VendorLedger {
  id: number
  vendor_id: number
  date: string
  transaction_type: VendorTransactionType
  reference_id: number | null
  reference_type: string | null
  debit: number
  credit: number
  balance_after: number
  description: string | null
  created_at: string
}

// =====================================================================
// CUSTOMERS
// =====================================================================
export type CustomerTransactionType = 'invoice' | 'receipt' | 'debit_note' | 'credit_note' | 'opening_balance'

export interface Customer {
  id: number
  customer_code: string | null
  name: string
  company_name: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  ntn: string | null
  strn: string | null
  opening_balance: number
  opening_balance_type: BalanceType
  is_active: number
  created_at: string
}

export interface CustomerLedger {
  id: number
  customer_id: number
  date: string
  transaction_type: CustomerTransactionType
  reference_id: number | null
  reference_type: string | null
  debit: number
  credit: number
  balance_after: number
  description: string | null
  created_at: string
}

// =====================================================================
// ITEM CATALOG
// =====================================================================
export type ItemType = 'raw_material' | 'finished_good' | 'fabricated' | 'service'

export interface ItemCategory {
  id: number
  name: string
  parent_id: number | null
  created_at: string
}

export interface Unit {
  id: number
  name: string
  short_code: string
}

export interface Item {
  id: number
  item_code: string | null
  name: string
  category_id: number | null
  item_type: ItemType
  unit_id: number | null
  reorder_level: number
  standard_cost: number
  standard_sale_price: number
  hsn_code: string | null
  description: string | null
  is_active: number
  created_at: string
}

export interface Warehouse {
  id: number
  name: string
  location: string | null
  is_active: number
  created_at: string
}

export interface ItemStock {
  id: number
  item_id: number
  warehouse_id: number
  quantity_on_hand: number
  average_cost: number
  updated_at: string
}

// =====================================================================
// STOCK MOVEMENTS
// =====================================================================
export type MovementType =
  | 'purchase_in'
  | 'fabrication_in'
  | 'fabrication_out'
  | 'project_issue'
  | 'project_return'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'sale_out'
  | 'opening_stock'

export interface StockMovement {
  id: number
  item_id: number
  warehouse_id: number
  movement_type: MovementType
  quantity: number
  unit_cost: number
  total_value: number
  reference_type: string | null
  reference_id: number | null
  date: string
  notes: string | null
  created_by: number | null
  created_at: string
}

// =====================================================================
// PURCHASES
// =====================================================================
export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'online'

export interface PurchaseOrder {
  id: number
  po_number: string
  vendor_id: number
  date: string
  status: PurchaseOrderStatus
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface PurchaseOrderItem {
  id: number
  purchase_order_id: number
  item_id: number
  quantity: number
  rate: number
  amount: number
}

export interface PurchaseInvoice {
  id: number
  invoice_number: string
  vendor_id: number
  vendor_invoice_no: string | null
  date: string
  purchase_order_id: number | null
  subtotal: number
  discount: number
  gst_amount: number
  withholding_tax_amount: number
  other_charges: number
  total_amount: number
  payment_status: PaymentStatus
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface PurchaseInvoiceItem {
  id: number
  purchase_invoice_id: number
  item_id: number
  quantity: number
  rate: number
  discount_percent: number
  amount: number
  gst_percent: number
  gst_amount: number
}

export interface VendorPayment {
  id: number
  payment_number: string
  vendor_id: number
  date: string
  amount: number
  payment_method: PaymentMethod
  bank_account_id: number | null
  reference_no: string | null
  purchase_invoice_id: number | null
  notes: string | null
  created_by: number | null
  created_at: string
}

// =====================================================================
// FABRICATION / BOM
// =====================================================================
export type FabricationOrderStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export interface BOM {
  id: number
  finished_item_id: number
  name: string
  output_quantity: number
  labor_cost_estimate: number
  overhead_cost_estimate: number
  notes: string | null
  is_active: number
  created_at: string
}

export interface BOMComponent {
  id: number
  bom_id: number
  raw_material_item_id: number
  quantity_required: number
  wastage_percent: number
}

export interface FabricationOrder {
  id: number
  fab_order_number: string
  bom_id: number
  finished_item_id: number
  quantity_to_produce: number
  quantity_produced: number
  warehouse_id: number
  date_started: string | null
  date_completed: string | null
  status: FabricationOrderStatus
  actual_labor_cost: number
  actual_overhead_cost: number
  total_material_cost: number
  total_fabrication_cost: number
  cost_per_unit: number
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface FabricationOrderMaterial {
  id: number
  fabrication_order_id: number
  raw_material_item_id: number
  quantity_consumed: number
  unit_cost: number
  total_cost: number
}

// =====================================================================
// PROJECTS
// =====================================================================
export type ProjectStatus = 'quotation' | 'approved' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled'

export interface Project {
  id: number
  project_code: string | null
  project_name: string
  customer_id: number | null
  site_address: string | null
  description: string | null
  start_date: string | null
  expected_end_date: string | null
  actual_end_date: string | null
  status: ProjectStatus
  contract_value: number
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface ProjectMaterialIssued {
  id: number
  project_id: number
  item_id: number
  warehouse_id: number
  quantity_issued: number
  unit_cost: number
  total_cost: number
  date: string
  issued_to: string | null
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface ProjectMaterialReturn {
  id: number
  project_id: number
  item_id: number
  warehouse_id: number
  quantity_returned: number
  date: string
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface ProjectLaborCost {
  id: number
  project_id: number
  employee_id: number | null
  date: string
  hours_worked: number
  rate_per_hour: number
  daily_wage_amount: number
  description: string | null
  created_by: number | null
  created_at: string
}

export interface ProjectOtherExpense {
  id: number
  project_id: number
  expense_category: string
  description: string | null
  amount: number
  date: string
  paid_via: 'cash' | 'bank' | null
  bank_account_id: number | null
  created_by: number | null
  created_at: string
}

// =====================================================================
// SALES / PROJECT INVOICES
// =====================================================================
export type SalesPaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface SalesInvoice {
  id: number
  invoice_number: string
  project_id: number | null
  customer_id: number
  date: string
  subtotal: number
  discount_percent: number
  discount_amount: number
  gst_percent: number
  gst_amount: number
  further_tax_percent: number
  further_tax_amount: number
  withholding_tax_percent: number
  withholding_tax_amount: number
  total_before_tax: number
  total_tax: number
  grand_total: number
  amount_received: number
  balance_due: number
  payment_status: SalesPaymentStatus
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface SalesInvoiceItem {
  id: number
  sales_invoice_id: number
  item_id: number | null
  description: string
  quantity: number
  unit: string | null
  rate: number
  amount: number
  gst_percent: number
  gst_amount: number
}

export interface CustomerReceipt {
  id: number
  receipt_number: string
  customer_id: number
  date: string
  amount: number
  payment_method: PaymentMethod
  bank_account_id: number | null
  reference_no: string | null
  sales_invoice_id: number | null
  notes: string | null
  created_by: number | null
  created_at: string
}

// =====================================================================
// EXPENSES
// =====================================================================
export type ExpenseCategoryType = 'admin' | 'project' | 'overhead'
export type PaidVia = 'cash' | 'bank'

export interface ExpenseCategory {
  id: number
  name: string
  type: ExpenseCategoryType
}

export interface CompanyExpense {
  id: number
  expense_number: string
  category_id: number
  project_id: number | null
  description: string | null
  amount: number
  date: string
  paid_via: PaidVia
  bank_account_id: number | null
  receipt_attached: number
  created_by: number | null
  created_at: string
}

// =====================================================================
// HR & PAYROLL
// =====================================================================
export type EmployeeDesignation = 'technician' | 'helper' | 'engineer' | 'admin' | 'accountant' | 'manager' | 'other'
export type SalaryType = 'monthly' | 'daily_wage'
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday'
export type AdvanceStatus = 'pending' | 'adjusted'

export interface Employee {
  id: number
  employee_code: string | null
  full_name: string
  designation: EmployeeDesignation
  phone: string | null
  cnic: string | null
  address: string | null
  joining_date: string | null
  salary_type: SalaryType
  monthly_salary: number
  daily_rate: number
  is_active: number
  created_at: string
}

export interface Attendance {
  id: number
  employee_id: number
  date: string
  status: AttendanceStatus
  overtime_hours: number
  notes: string | null
  created_by: number | null
  created_at: string
}

export interface SalaryPayment {
  id: number
  employee_id: number
  month: string
  year: number
  basic_salary: number
  days_present: number
  overtime_amount: number
  deductions: number
  advance_deduction: number
  net_salary: number
  payment_date: string | null
  paid_via: PaidVia | null
  bank_account_id: number | null
  created_by: number | null
  created_at: string
}

export interface EmployeeAdvance {
  id: number
  employee_id: number
  date: string
  amount: number
  reason: string | null
  status: AdvanceStatus
  created_by: number | null
  created_at: string
}

// =====================================================================
// CASH & BANK
// =====================================================================
export type AccountType = 'cash' | 'bank'
export type CashBankTransactionType = 'receipt' | 'payment' | 'transfer_in' | 'transfer_out'

export interface BankAccount {
  id: number
  account_name: string
  bank_name: string | null
  account_number: string | null
  branch: string | null
  opening_balance: number
  current_balance: number
  is_active: number
  created_at: string
}

export interface CashAccount {
  id: number
  account_name: string
  opening_balance: number
  current_balance: number
  is_active: number
  created_at: string
}

export interface CashBankTransaction {
  id: number
  account_type: AccountType
  account_id: number
  date: string
  transaction_type: CashBankTransactionType
  amount: number
  reference_type: string | null
  reference_id: number | null
  description: string | null
  balance_after: number
  created_by: number | null
  created_at: string
}

// =====================================================================
// ACCOUNTING
// =====================================================================
export type AccountCategoryType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface ChartOfAccount {
  id: number
  account_code: string | null
  account_name: string
  account_type: AccountCategoryType
  parent_id: number | null
  is_active: number
  created_at: string
}

export interface JournalEntry {
  id: number
  entry_number: string
  date: string
  reference_type: string | null
  reference_id: number | null
  description: string | null
  created_by: number | null
  created_at: string
}

export interface JournalEntryLine {
  id: number
  journal_entry_id: number
  account_id: number
  debit: number
  credit: number
  description: string | null
}
