-- HVAC ERP Master Database Schema
-- SQLite / better-sqlite3
-- Foreign key enforcement should be enabled at connection time.

-- =====================================================================
-- 1. SETTINGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 2. USERS & AUTH
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'accountant', 'storekeeper', 'technician', 'viewer')),
  force_password_change INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  module TEXT,
  record_id INTEGER,
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 3. VENDORS
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_code TEXT UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  ntn TEXT,
  opening_balance REAL DEFAULT 0,
  opening_balance_type TEXT DEFAULT 'debit' CHECK (opening_balance_type IN ('debit', 'credit')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'debit_note', 'credit_note', 'opening_balance')),
  reference_id INTEGER,
  reference_type TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  balance_after REAL DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- =====================================================================
-- 4. CUSTOMERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  ntn TEXT,
  strn TEXT,
  opening_balance REAL DEFAULT 0,
  opening_balance_type TEXT DEFAULT 'debit' CHECK (opening_balance_type IN ('debit', 'credit')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('invoice', 'receipt', 'debit_note', 'credit_note', 'opening_balance')),
  reference_id INTEGER,
  reference_type TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  balance_after REAL DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- =====================================================================
-- 5. ITEM CATALOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES item_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER,
  item_type TEXT NOT NULL CHECK (item_type IN ('raw_material', 'finished_good', 'fabricated', 'service')),
  unit_id INTEGER,
  reorder_level REAL DEFAULT 0,
  standard_cost REAL DEFAULT 0,
  standard_sale_price REAL DEFAULT 0,
  hsn_code TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  quantity_on_hand REAL DEFAULT 0,
  average_cost REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  UNIQUE(item_id, warehouse_id)
);

-- =====================================================================
-- 6. STOCK MOVEMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_in', 'fabrication_in', 'fabrication_out', 'project_issue', 'project_return', 'adjustment_in', 'adjustment_out', 'sale_out', 'opening_stock')),
  quantity REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  total_value REAL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 7. PURCHASES
-- =====================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL,
  vendor_invoice_no TEXT,
  date TEXT NOT NULL,
  purchase_order_id INTEGER,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  withholding_tax_amount REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  rate REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  amount REAL NOT NULL,
  gst_percent REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'online')),
  bank_account_id INTEGER,
  reference_no TEXT,
  purchase_invoice_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 8. FABRICATION / BOM
-- =====================================================================
CREATE TABLE IF NOT EXISTS bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finished_item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  output_quantity REAL NOT NULL DEFAULT 1,
  labor_cost_estimate REAL DEFAULT 0,
  overhead_cost_estimate REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finished_item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bom_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL,
  raw_material_item_id INTEGER NOT NULL,
  quantity_required REAL NOT NULL,
  wastage_percent REAL DEFAULT 0,
  FOREIGN KEY (bom_id) REFERENCES bom(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fabrication_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fab_order_number TEXT UNIQUE NOT NULL,
  bom_id INTEGER NOT NULL,
  finished_item_id INTEGER NOT NULL,
  quantity_to_produce REAL NOT NULL,
  quantity_produced REAL DEFAULT 0,
  warehouse_id INTEGER NOT NULL,
  date_started TEXT,
  date_completed TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  actual_labor_cost REAL DEFAULT 0,
  actual_overhead_cost REAL DEFAULT 0,
  total_material_cost REAL DEFAULT 0,
  total_fabrication_cost REAL DEFAULT 0,
  cost_per_unit REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_id) REFERENCES bom(id) ON DELETE RESTRICT,
  FOREIGN KEY (finished_item_id) REFERENCES items(id) ON DELETE RESTRICT,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fabrication_order_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fabrication_order_id INTEGER NOT NULL,
  raw_material_item_id INTEGER NOT NULL,
  quantity_consumed REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  FOREIGN KEY (fabrication_order_id) REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_item_id) REFERENCES items(id) ON DELETE RESTRICT
);

-- =====================================================================
-- 9. PROJECTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT UNIQUE,
  project_name TEXT NOT NULL,
  customer_id INTEGER,
  site_address TEXT,
  description TEXT,
  start_date TEXT,
  expected_end_date TEXT,
  actual_end_date TEXT,
  status TEXT NOT NULL DEFAULT 'quotation' CHECK (status IN ('quotation', 'approved', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  contract_value REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_materials_issued (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  quantity_issued REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  date TEXT NOT NULL,
  issued_to TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_material_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  quantity_returned REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_labor_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  employee_id INTEGER,
  date TEXT NOT NULL,
  hours_worked REAL DEFAULT 0,
  rate_per_hour REAL DEFAULT 0,
  daily_wage_amount REAL DEFAULT 0,
  description TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_other_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  expense_category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  paid_via TEXT CHECK (paid_via IN ('cash', 'bank')),
  bank_account_id INTEGER,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 10. SALES / PROJECT INVOICES
-- =====================================================================
CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  project_id INTEGER,
  customer_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  subtotal REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  gst_percent REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  further_tax_percent REAL DEFAULT 0,
  further_tax_amount REAL DEFAULT 0,
  withholding_tax_percent REAL DEFAULT 0,
  withholding_tax_amount REAL DEFAULT 0,
  total_before_tax REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  amount_received REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_invoice_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  gst_percent REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'online')),
  bank_account_id INTEGER,
  reference_no TEXT,
  sales_invoice_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 11. EXPENSES
-- =====================================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'admin' CHECK (type IN ('admin', 'project', 'overhead'))
);

CREATE TABLE IF NOT EXISTS company_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT UNIQUE NOT NULL,
  category_id INTEGER NOT NULL,
  project_id INTEGER,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  paid_via TEXT NOT NULL CHECK (paid_via IN ('cash', 'bank')),
  bank_account_id INTEGER,
  receipt_attached INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 12. HR & PAYROLL
-- =====================================================================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  designation TEXT DEFAULT 'other' CHECK (designation IN ('technician', 'helper', 'engineer', 'admin', 'accountant', 'manager', 'other')),
  phone TEXT,
  cnic TEXT,
  address TEXT,
  joining_date TEXT,
  salary_type TEXT DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'daily_wage')),
  monthly_salary REAL DEFAULT 0,
  daily_rate REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'holiday')),
  overtime_hours REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  basic_salary REAL DEFAULT 0,
  days_present REAL DEFAULT 0,
  overtime_amount REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  advance_deduction REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  payment_date TEXT,
  paid_via TEXT CHECK (paid_via IN ('cash', 'bank')),
  bank_account_id INTEGER,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adjusted')),
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 13. CASH & BANK
-- =====================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  branch TEXT,
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL,
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank')),
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receipt', 'payment', 'transfer_in', 'transfer_out')),
  amount REAL NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  description TEXT,
  balance_after REAL DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================================
-- 14. ACCOUNTING
-- =====================================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_code TEXT UNIQUE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  description TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  description TEXT,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
);

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor ON vendor_ledger(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_date ON vendor_ledger(date);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON customer_ledger(date);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_unit ON items(unit_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_item ON item_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_warehouse ON item_stock(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(date);

CREATE INDEX IF NOT EXISTS idx_bom_finished_item ON bom(finished_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_components_bom ON bom_components(bom_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_orders_bom ON fabrication_orders(bom_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_orders_status ON fabrication_orders(status);
CREATE INDEX IF NOT EXISTS idx_fabrication_order_materials_order ON fabrication_order_materials(fabrication_order_id);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects(start_date, expected_end_date);
CREATE INDEX IF NOT EXISTS idx_project_materials_issued_project ON project_materials_issued(project_id);
CREATE INDEX IF NOT EXISTS idx_project_material_returns_project ON project_material_returns(project_id);
CREATE INDEX IF NOT EXISTS idx_project_labor_costs_project ON project_labor_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_other_expenses_project ON project_other_expenses(project_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_project ON sales_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date ON sales_invoices(date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer ON customer_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_date ON customer_receipts(date);

CREATE INDEX IF NOT EXISTS idx_company_expenses_category ON company_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_company_expenses_date ON company_expenses(date);
CREATE INDEX IF NOT EXISTS idx_company_expenses_project ON company_expenses(project_id);

CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_month_year ON salary_payments(month, year);

CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_account ON cash_bank_transactions(account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_cash_bank_transactions_date ON cash_bank_transactions(date);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);
