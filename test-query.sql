SELECT pmi.date, 'Material Issue' as type, i.name as description, pmi.total_cost as debit, 0 as credit, pmi.created_at
FROM project_materials_issued pmi JOIN items i ON pmi.item_id = i.id WHERE pmi.project_id = 1
UNION ALL
SELECT plc.date, 'Labor Cost' as type, COALESCE(e.full_name, plc.description, 'Labor') as description, plc.daily_wage_amount as debit, 0 as credit, plc.created_at
FROM project_labor_costs plc LEFT JOIN employees e ON plc.employee_id = e.id WHERE plc.project_id = 1
UNION ALL
SELECT poe.date, 'Expense' as type, poe.expense_category || COALESCE(' - ' || poe.description, '') as description, poe.amount as debit, 0 as credit, poe.created_at
FROM project_other_expenses poe WHERE poe.project_id = 1
UNION ALL
SELECT si.date, 'Sales Invoice (' || si.invoice_number || ')' as type, COALESCE(si.notes, 'Project Revenue') as description, 0 as debit, si.total_before_tax as credit, si.created_at
FROM sales_invoices si WHERE si.project_id = 1 AND si.is_voided = 0
ORDER BY date ASC, created_at ASC;
