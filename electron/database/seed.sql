-- HVAC ERP Seed Data
-- Initial reference data required before any module can be used.

-- =====================================================================
-- UNITS
-- =====================================================================
INSERT OR IGNORE INTO units (name, short_code) VALUES
  ('Kilogram', 'Kg'),
  ('Meter', 'Mtr'),
  ('Square Feet', 'Sqft'),
  ('Piece', 'Pcs'),
  ('Liter', 'Ltr'),
  ('Roll', 'Roll'),
  ('Set', 'Set'),
  ('Box', 'Box'),
  ('Feet', 'Ft'),
  ('Inch', 'Inch'),
  ('Sheet', 'Sheet'),
  ('Coil', 'Coil'),
  ('Ton', 'Ton'),
  ('Hour', 'Hr');

-- =====================================================================
-- ITEM CATEGORIES
-- =====================================================================
INSERT OR IGNORE INTO item_categories (name, parent_id) VALUES
  ('Sheet Metal', NULL),
  ('Insulation', NULL),
  ('Fasteners', NULL),
  ('Ducts', NULL),
  ('Diffusers & Grilles', NULL),
  ('AC Units', NULL),
  ('Refrigerant Pipes', NULL),
  ('Electrical Items', NULL),
  ('Consumables', NULL),
  ('Fabricated Items', NULL),
  ('Services', NULL);

-- =====================================================================
-- WAREHOUSES
-- =====================================================================
INSERT OR IGNORE INTO warehouses (name, location, is_active) VALUES
  ('Main Warehouse', 'Primary storage facility', 1),
  ('Fabrication Workshop', 'In-house fabrication area', 1);

-- =====================================================================
-- EXPENSE CATEGORIES
-- =====================================================================
INSERT OR IGNORE INTO expense_categories (name, type) VALUES
  ('Fuel', 'admin'),
  ('Office Rent', 'overhead'),
  ('Utilities', 'overhead'),
  ('Transport', 'admin'),
  ('Tools & Equipment', 'overhead'),
  ('Miscellaneous', 'admin'),
  ('Project Site Expense', 'project'),
  ('Labor Camp Expense', 'project');

-- =====================================================================
-- CHART OF ACCOUNTS
-- =====================================================================
INSERT OR IGNORE INTO chart_of_accounts (account_code, account_name, account_type, parent_id, is_active) VALUES
  -- Assets
  ('1000', 'Cash', 'asset', NULL, 1),
  ('1100', 'Bank', 'asset', NULL, 1),
  ('1200', 'Accounts Receivable', 'asset', NULL, 1),
  ('1300', 'Inventory - Raw Material', 'asset', NULL, 1),
  ('1400', 'Inventory - Finished Goods', 'asset', NULL, 1),
  ('1500', 'Withholding Tax Receivable', 'asset', NULL, 1),

  -- Liabilities
  ('2000', 'Accounts Payable', 'liability', NULL, 1),
  ('2100', 'Sales Tax Payable (GST)', 'liability', NULL, 1),
  ('2200', 'Withholding Tax Payable', 'liability', NULL, 1),
  ('2300', 'Salaries Payable', 'liability', NULL, 1),

  -- Equity
  ('3000', 'Owner''s Equity', 'equity', NULL, 1),

  -- Income
  ('4000', 'Sales Revenue', 'income', NULL, 1),
  ('4100', 'Project Revenue', 'income', NULL, 1),
  ('4200', 'Other Income', 'income', NULL, 1),

  -- Expenses
  ('5000', 'Cost of Materials', 'expense', NULL, 1),
  ('5100', 'Fabrication Cost', 'expense', NULL, 1),
  ('5200', 'Labor Cost', 'expense', NULL, 1),
  ('5300', 'Project Expenses', 'expense', NULL, 1),
  ('5400', 'Salaries Expense', 'expense', NULL, 1),
  ('5500', 'Office Expenses', 'expense', NULL, 1),
  ('5600', 'Utilities Expense', 'expense', NULL, 1),
  ('5700', 'Transport Expense', 'expense', NULL, 1),
  ('5800', 'Rent Expense', 'expense', NULL, 1);

-- =====================================================================
-- DEFAULT CASH / BANK ACCOUNTS
-- =====================================================================
INSERT OR IGNORE INTO cash_accounts (account_name, opening_balance, current_balance, is_active) VALUES
  ('Main Cash', 0, 0, 1),
  ('Petty Cash', 0, 0, 1);

INSERT OR IGNORE INTO bank_accounts (account_name, bank_name, opening_balance, current_balance, is_active) VALUES
  ('Primary Bank Account', 'Default Bank', 0, 0, 1);
