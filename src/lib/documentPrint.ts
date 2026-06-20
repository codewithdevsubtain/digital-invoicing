import { formatDate } from './format.js'
import type { AppSettings } from '../store/settingsStore.js'
import type { Customer } from './types.js'

export type DocumentKind = 'invoice' | 'quotation' | 'tax_invoice'

export interface DocumentCompany {
  name: string
  address?: string
  email?: string
  phone?: string
  ntn?: string
  strn?: string
  logo?: string
}

export interface DocumentCustomer {
  name: string
  address?: string
  email?: string
  phone?: string
  ntn?: string
  company_name?: string
}

export interface DocumentLine {
  item: string
  description: string
  price: number
  qty: number
  total: number
}

export interface DocumentPrintData {
  kind: DocumentKind
  documentNumber: string
  date: string
  dueDate?: string
  company: DocumentCompany
  customer: DocumentCustomer
  lines: DocumentLine[]
  subtotal: number
  gstPercent: number
  gstAmount: number
  furtherTaxAmount?: number
  discountAmount?: number
  deliveryAmount?: number
  total: number
  notes?: string
  currencySymbol?: string
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printMoney(amount: number, symbol = 'Rs'): string {
  const formatted = Math.abs(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol}${amount < 0 ? '-' : ''}${formatted}`
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HQ'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function documentTitle(kind: DocumentKind): string {
  if (kind === 'quotation') return 'QUOTATION'
  if (kind === 'tax_invoice') return 'TAX INVOICE'
  return 'INVOICE'
}

function customerBlock(customer: DocumentCustomer): string {
  const lines: string[] = []
  if (customer.address) lines.push(escapeHtml(customer.address))
  if (customer.email) lines.push(`<strong>Email:</strong> ${escapeHtml(customer.email)}`)
  if (customer.phone) lines.push(`<strong>Phone:</strong> ${escapeHtml(customer.phone)}`)
  if (customer.ntn) lines.push(`<strong>NTN:</strong> ${escapeHtml(customer.ntn)}`)
  return lines.join('<br />')
}

function companyContact(company: DocumentCompany): string {
  const lines: string[] = []
  if (company.email) lines.push(`<strong>Email:</strong> ${escapeHtml(company.email)}`)
  if (company.phone) lines.push(`<strong>Phone:</strong> ${escapeHtml(company.phone)}`)
  if (company.ntn) lines.push(`<strong>NTN:</strong> ${escapeHtml(company.ntn)}`)
  if (company.strn) lines.push(`<strong>STRN:</strong> ${escapeHtml(company.strn)}`)
  return lines.join('<br />')
}

export function buildDocumentPrintHtml(data: DocumentPrintData): string {
  const title = documentTitle(data.kind)
  const symbol = data.currencySymbol?.replace(/\.$/, '') || 'Rs'
  const logoHtml = data.company.logo
    ? `<img src="${data.company.logo}" alt="Logo" class="logo-img" />`
    : `<div class="logo-fallback">${escapeHtml(companyInitials(data.company.name))}</div>`

  const rows = data.lines.map((line, index) => `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-item">${escapeHtml(line.item)}</td>
      <td class="col-desc">${escapeHtml(line.description)}</td>
      <td class="col-price">${printMoney(line.price, symbol)}</td>
      <td class="col-qty">${escapeHtml(line.qty)}</td>
      <td class="col-total">${printMoney(line.total, symbol)}</td>
    </tr>
  `).join('')

  const summaryRows: string[] = [
    `<div class="summary-row"><span>SUBTOTAL</span><span>${printMoney(data.subtotal, symbol)}</span></div>`,
  ]
  if (data.discountAmount && data.discountAmount > 0) {
    summaryRows.push(`<div class="summary-row"><span>DISCOUNT</span><span>-${printMoney(data.discountAmount, symbol)}</span></div>`)
  }
  if (data.gstAmount > 0) {
    summaryRows.push(`<div class="summary-row"><span>GST ${data.gstPercent}%</span><span>${printMoney(data.gstAmount, symbol)}</span></div>`)
  }
  if (data.furtherTaxAmount && data.furtherTaxAmount > 0) {
    summaryRows.push(`<div class="summary-row"><span>FURTHER TAX</span><span>${printMoney(data.furtherTaxAmount, symbol)}</span></div>`)
  }
  if (data.deliveryAmount && data.deliveryAmount > 0) {
    summaryRows.push(`<div class="summary-row"><span>DELIVERY</span><span>${printMoney(data.deliveryAmount, symbol)}</span></div>`)
  }

  const notesHtml = data.notes?.trim()
    ? `<div class="notes"><div class="notes-label">PLEASE NOTE:</div><div class="notes-body">${escapeHtml(data.notes)}</div></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} ${escapeHtml(data.documentNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 40px;
      font-family: Arial, Helvetica, sans-serif;
      color: #444;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 18px;
    }
    .logo-wrap { width: 72px; flex-shrink: 0; }
    .logo-img { width: 72px; height: 72px; object-fit: contain; display: block; }
    .logo-fallback {
      width: 72px; height: 72px; border-radius: 8px;
      background: #2f7ec0; color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 700;
    }
    .company-block { flex: 1; text-align: right; }
    .company-name { margin: 0 0 6px; font-size: 28px; line-height: 1.1; color: #2f7ec0; font-weight: 700; }
    .company-address { margin: 0 0 8px; font-size: 13px; color: #666; }
    .company-contact { font-size: 12px; line-height: 1.7; color: #666; }
    .divider { height: 2px; background: #2f7ec0; margin: 18px 0 24px; }
    .meta {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
      margin-bottom: 28px;
    }
    .bill-to-label, .doc-label { font-size: 11px; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
    .customer-name { margin: 0 0 8px; font-size: 24px; color: #333; font-weight: 700; }
    .customer-details, .doc-dates { font-size: 12px; line-height: 1.7; color: #666; }
    .doc-side { text-align: right; min-width: 220px; }
    .doc-number { margin: 0 0 10px; font-size: 28px; color: #2f7ec0; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th {
      background: #eef3f8; color: #555; font-size: 11px; letter-spacing: 0.06em;
      text-transform: uppercase; font-weight: 700; padding: 12px 10px; text-align: left;
    }
    tbody td { padding: 0; font-size: 13px; vertical-align: middle; }
    .col-no {
      width: 52px; background: #2f7ec0; color: #fff; text-align: center; font-weight: 700;
      padding: 14px 8px !important;
    }
    .col-item { padding: 14px 12px !important; color: #333; width: 14%; }
    .col-desc { padding: 14px 12px !important; color: #2f7ec0; width: 34%; }
    .col-price {
      padding: 14px 12px !important; background: #f3f6fa; text-align: right; width: 16%;
      color: #333;
    }
    .col-qty { padding: 14px 12px !important; text-align: center; width: 10%; color: #333; }
    .col-total {
      padding: 14px 12px !important; background: #2f7ec0; color: #fff; text-align: right;
      font-weight: 700; width: 16%;
    }
    .bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .notes {
      flex: 1; border-left: 4px solid #2f7ec0; padding: 8px 0 8px 14px; min-height: 72px;
    }
    .notes-label { font-size: 11px; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
    .notes-body { font-size: 13px; color: #555; white-space: pre-wrap; }
    .summary { width: 320px; flex-shrink: 0; }
    .summary-row {
      display: flex; justify-content: space-between; gap: 16px;
      padding: 10px 0; font-size: 13px; color: #666; border-bottom: 1px solid #e5e7eb;
    }
    .summary-total {
      display: flex; justify-content: space-between; gap: 16px;
      padding-top: 14px; margin-top: 8px; border-top: 3px solid #2f7ec0;
      font-size: 24px; font-weight: 700; color: #2f7ec0;
    }
    .footer {
      margin-top: 48px; padding-top: 18px; border-top: 1px solid #ddd;
      text-align: center; font-size: 12px; color: #888;
    }
    @media print {
      body { padding: 18px 24px; }
      @page { size: A4; margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-wrap">${logoHtml}</div>
    <div class="company-block">
      <h1 class="company-name">${escapeHtml(data.company.name)}</h1>
      ${data.company.address ? `<p class="company-address">${escapeHtml(data.company.address)}</p>` : ''}
      <div class="company-contact">${companyContact(data.company)}</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="meta">
    <div>
      <div class="bill-to-label">${data.kind === 'quotation' ? 'QUOTATION TO:' : 'INVOICE TO:'}</div>
      <h2 class="customer-name">${escapeHtml(data.customer.name)}</h2>
      <div class="customer-details">${customerBlock(data.customer)}</div>
    </div>
    <div class="doc-side">
      <h2 class="doc-number">${escapeHtml(title)}: ${escapeHtml(data.documentNumber)}</h2>
      <div class="doc-dates">
        <div><strong>Date:</strong> ${escapeHtml(formatDate(data.date))}</div>
        ${data.dueDate ? `<div><strong>Due Date:</strong> ${escapeHtml(formatDate(data.dueDate))}</div>` : ''}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>NO.</th>
        <th>ITEM</th>
        <th>DESCRIPTION</th>
        <th style="text-align:right">PRICE</th>
        <th style="text-align:center">QTY</th>
        <th style="text-align:right">TOTAL</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="bottom">
    ${notesHtml}
    <div class="summary">
      ${summaryRows.join('')}
      <div class="summary-total">
        <span>TOTAL</span>
        <span>${printMoney(data.total, symbol)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    Thank you for choosing ${escapeHtml(data.company.name)} Services.
  </div>
</body>
</html>`
}

export function openDocumentPrintWindow(html: string, _title: string): void {
  const printWin = window.open('', '_blank', 'width=900,height=1100')
  if (!printWin) {
    alert('Please allow pop-ups to print or save as PDF.')
    return
  }
  printWin.document.open()
  printWin.document.write(html)
  printWin.document.close()
  printWin.focus()
  setTimeout(() => printWin.print(), 500)
}

export function companyFromSettings(settings: AppSettings): DocumentCompany {
  return {
    name: settings.company_name || 'HVAC ERP',
    address: settings.company_address || '',
    email: settings.company_email || '',
    phone: settings.company_phone || '',
    ntn: settings.company_ntn || '',
    strn: settings.company_strn || '',
    logo: settings.company_logo || '',
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function mapSalesInvoiceToDocument(
  inv: Record<string, any>,
  settings: AppSettings
): DocumentPrintData {
  const gstPercent = Number(inv.gst_percent ?? settings.default_gst_percent ?? 18)
  const lines: DocumentLine[] = (inv.items || []).map((li: any) => ({
    item: li.item_code || li.description?.split(' ')[0] || 'Item',
    description: li.description || '-',
    price: Number(li.rate) || 0,
    qty: Number(li.quantity) || 0,
    total: Number(li.amount) || 0,
  }))

  return {
    kind: 'tax_invoice',
    documentNumber: inv.invoice_number,
    date: inv.date,
    dueDate: inv.date,
    company: companyFromSettings(settings),
    customer: {
      name: inv.customer_name || 'Customer',
      address: inv.customer_address || '',
      email: inv.customer_email || '',
      phone: inv.customer_phone || '',
      ntn: inv.customer_ntn || '',
    },
    lines,
    subtotal: Number(inv.subtotal) || 0,
    gstPercent,
    gstAmount: Number(inv.gst_amount) || 0,
    furtherTaxAmount: Number(inv.further_tax_amount) || 0,
    discountAmount: Number(inv.discount_amount) || 0,
    deliveryAmount: 0,
    total: Number(inv.grand_total) || 0,
    notes: inv.notes || '',
    currencySymbol: settings.currency_symbol || 'Rs',
  }
}

export function mapProjectQuotationToDocument(
  project: Record<string, any>,
  customer: Customer | null,
  settings: AppSettings
): DocumentPrintData {
  const gstPercent = Number(settings.default_gst_percent ?? 18)
  const contractValue = Number(project.contract_value) || 0
  const subtotal = contractValue
  const gstAmount = round2(subtotal * gstPercent / 100)
  const total = round2(subtotal + gstAmount)

  const descriptionParts = [
    project.description,
    project.site_address ? `Site: ${project.site_address}` : '',
  ].filter(Boolean)

  return {
    kind: 'quotation',
    documentNumber: project.project_code || String(project.id),
    date: project.start_date || new Date().toISOString().split('T')[0],
    dueDate: project.expected_end_date || project.start_date || undefined,
    company: companyFromSettings(settings),
    customer: {
      name: customer?.name || project.customer_name || 'Customer',
      address: customer?.address || project.site_address || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
      ntn: customer?.ntn || '',
      company_name: customer?.company_name || '',
    },
    lines: [{
      item: project.project_name || 'HVAC Project',
      description: descriptionParts.join(' | ') || 'HVAC services quotation',
      price: contractValue,
      qty: 1,
      total: contractValue,
    }],
    subtotal,
    gstPercent,
    gstAmount,
    total,
    notes: project.notes || project.description || '',
    currencySymbol: settings.currency_symbol || 'Rs',
  }
}
