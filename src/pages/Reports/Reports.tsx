import { useState, useCallback, useEffect } from 'react'
import { TrendingUp, Users, Truck, Package, Percent, DollarSign, BarChart3, Printer, Download, Search } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import Loading from '../../components/Loading.js'

type ReportView = 'landing' | 'projectProfit' | 'receivables' | 'payables' | 'valuation' | 'lowStock' | 'salesTax' | 'wht' | 'expenseBreakdown' | 'employeeCost'

const reportCategories = [
  {
    label: 'Project Reports', icon: TrendingUp,
    items: [
      { view: 'projectProfit' as ReportView, label: 'Project Profitability', desc: 'Profit & margin by project' },
    ],
  },
  {
    label: 'Receivables & Payables', icon: Users,
    items: [
      { view: 'receivables' as ReportView, label: 'Receivables Aging', desc: 'Customer outstanding by age' },
      { view: 'payables' as ReportView, label: 'Payables Aging', desc: 'Vendor outstanding by age' },
    ],
  },
  {
    label: 'Inventory', icon: Package,
    items: [
      { view: 'valuation' as ReportView, label: 'Inventory Valuation', desc: 'Stock value by item' },
      { view: 'lowStock' as ReportView, label: 'Low Stock Report', desc: 'Items below reorder level' },
    ],
  },
  {
    label: 'Tax Reports', icon: Percent,
    items: [
      { view: 'salesTax' as ReportView, label: 'Sales Tax / GST', desc: 'Output vs Input GST for filing' },
      { view: 'wht' as ReportView, label: 'Withholding Tax', desc: 'WHT receivable vs payable' },
    ],
  },
  {
    label: 'Expense & HR', icon: DollarSign,
    items: [
      { view: 'expenseBreakdown' as ReportView, label: 'Expense Breakdown', desc: 'Expenses by category' },
      { view: 'employeeCost' as ReportView, label: 'Employee Cost', desc: 'Salary + project labor per employee' },
    ],
  },
]

function exportCSV(userId: number, addToast: any, defaultName: string, headers: string[], rows: string[][]) {
  api.reports.exportCSV(userId, { defaultName, headers, rows })
    .then((ok) => { if (ok) addToast({ type: 'success', title: 'Exported', message: 'CSV saved' }) })
    .catch(() => addToast({ type: 'error', title: 'Error', message: 'Export failed' }))
}

export default function Reports() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [view, setView] = useState<ReportView>('landing')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  // Report params
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [asOfDate, setAsOfDate] = useState(today)
  const [rptMonth, setRptMonth] = useState(String(now.getMonth() + 1))
  const [rptYear, setRptYear] = useState(String(now.getFullYear()))

  const useAuth = useAuthStore

  const runReport = useCallback(async (reportFn: () => Promise<any>) => {
    if (!user) return
    setLoading(true)
    try {
      const result = await reportFn()
      setData(result)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load report' }) }
    finally { setLoading(false) }
  }, [user, addToast])

  useEffect(() => {
    if (view !== 'landing' && !data) {
      // Auto-run on view change if data is fresh
    }
  }, [view])

  const csvHeadersAndRows = (): { headers: string[]; rows: string[][] } | null => {
    if (!data?.rows?.length) return null
    const keys = Object.keys(data.rows[0])
    return { headers: keys, rows: data.rows.map((r: any) => keys.map((k) => String(r[k] ?? ''))) }
  }

  const runAndExport = async (reportFn: () => Promise<any>, defaultName: string) => {
    if (!user) return
    try {
      const result = await reportFn()
      setData(result)
      if (result?.rows?.length) {
        const keys = Object.keys(result.rows[0])
        exportCSV(user.id, addToast, defaultName, keys, result.rows.map((r: any) => keys.map((k) => String(r[k] ?? ''))))
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed' }) }
  }

  if (view === 'landing') {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Comprehensive business reports" />
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reportCategories.map((cat) => (
            <div key={cat.label} className="card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3"><cat.icon size={16} />{cat.label}</h3>
              <div className="space-y-2">
                {cat.items.map((item) => (
                  <button key={item.view} onClick={() => { setView(item.view); setData(null) }}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition">
                    <p className="text-sm font-medium text-navy-800">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const back = () => { setView('landing'); setData(null) }

  return (
    <div>
      <button onClick={back} className="mb-4 text-sm text-gray-500 hover:text-gray-700">&larr; All Reports</button>
      <PageHeader title={view.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())} subtitle="Business report" />

      <div className="mt-6 space-y-4">
        {/* Filters */}
        {(view === 'projectProfit' || view === 'salesTax' || view === 'wht' || view === 'expenseBreakdown') && (
          <div className="card p-3 flex items-center gap-3">
            <span className="text-xs text-gray-500">From:</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm w-36" />
            <span className="text-xs text-gray-500">To:</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm w-36" />
            <button onClick={() => runReport(() => {
              if (view === 'projectProfit') return api.reports.projectProfitability(user!.id, { date_from: dateFrom, date_to: dateTo })
              if (view === 'salesTax') return api.reports.salesTax(user!.id, { date_from: dateFrom, date_to: dateTo })
              if (view === 'wht') return api.reports.wht(user!.id, { date_from: dateFrom, date_to: dateTo })
              return api.reports.expenseBreakdown(user!.id, { date_from: dateFrom, date_to: dateTo })
            })} className="btn-primary text-sm !py-2">Run Report</button>
            <button onClick={() => runAndExport(() => {
              if (view === 'projectProfit') return api.reports.projectProfitability(user!.id, { date_from: dateFrom, date_to: dateTo })
              if (view === 'salesTax') return api.reports.salesTax(user!.id, { date_from: dateFrom, date_to: dateTo })
              return api.reports.expenseBreakdown(user!.id, { date_from: dateFrom, date_to: dateTo })
            }, `${view}-${dateFrom}-${dateTo}.csv`)} className="btn-secondary gap-1 text-xs"><Download size={12} /> CSV</button>
          </div>
        )}
        {(view === 'receivables' || view === 'payables' || view === 'valuation') && (
          <div className="card p-3 flex items-center gap-3">
            <span className="text-xs text-gray-500">As of:</span><input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="input-field text-sm w-36" />
            <button onClick={() => runReport(() => {
              if (view === 'receivables') return api.reports.receivablesAging(user!.id, asOfDate)
              if (view === 'payables') return api.reports.payablesAging(user!.id, asOfDate)
              return api.reports.inventoryValuation(user!.id, asOfDate)
            })} className="btn-primary text-sm !py-2">Run Report</button>
          </div>
        )}
        {(view === 'employeeCost') && (
          <div className="card p-3 flex items-center gap-3">
            <select value={rptMonth} onChange={(e) => setRptMonth(e.target.value)} className="input-field text-sm w-32">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={rptYear} onChange={(e) => setRptYear(e.target.value)} className="input-field text-sm w-20" />
            <button onClick={() => runReport(() => api.reports.employeeCost(user!.id, { month: rptMonth, year: Number(rptYear) }))} className="btn-primary text-sm !py-2">Run Report</button>
          </div>
        )}
        {(view === 'lowStock') && (
          <div className="card p-3 flex items-center gap-3">
            <button onClick={() => runReport(() => api.reports.lowStock())} className="btn-primary text-sm !py-2">Load Report</button>
          </div>
        )}

        {loading ? <Loading /> : (
          <div>
            {/* === Project Profit === */}
            {view === 'projectProfit' && data && (
              <div className="card p-4">
                <div className="flex justify-end gap-2 mb-3"><button onClick={() => { const c = csvHeadersAndRows(); if (c) exportCSV(user!.id, addToast, `project-profit-${dateFrom}-${dateTo}.csv`, c.headers, c.rows) }} className="btn-secondary gap-1 text-xs"><Download size={12} /> CSV</button></div>
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Project</th><th className="py-2 pr-3 text-left">Customer</th><th className="py-2 pr-3 text-left">Status</th><th className="py-2 pr-3 text-right">Revenue</th><th className="py-2 pr-3 text-right">Material</th><th className="py-2 pr-3 text-right">Labor</th><th className="py-2 pr-3 text-right">Other</th><th className="py-2 pr-3 text-right">Total Cost</th><th className="py-2 pr-3 text-right">Profit</th><th className="py-2 text-right">Margin %</th></tr></thead>
                  <tbody>
                    {data.rows?.map((r: any) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3 font-medium">{r.project_name}</td>
                        <td className="py-2 pr-3">{r.customer_name ?? '-'}</td>
                        <td className="py-2 pr-3"><span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">{r.status}</span></td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(r.total_revenue)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(r.material_cost)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(r.labor_cost)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(r.other_expenses)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(r.total_cost)}</td>
                        <td className={`py-2 pr-3 text-right font-medium ${r.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.net_profit)}</td>
                        <td className={`py-2 text-right font-medium ${r.profit_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.profit_margin_percent}%</td>
                      </tr>
                    ))}
                    {data.totals && (
                      <tr className="font-bold border-t-2">
                        <td colSpan={3} className="py-2 pr-3">Grand Total</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(data.totals.total_revenue)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(data.totals.material_cost)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(data.totals.labor_cost)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(data.totals.other_expenses)}</td>
                        <td className="py-2 pr-3 text-right">{formatCurrency(data.totals.total_cost)}</td>
                        <td className={`py-2 pr-3 text-right ${data.totals.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(data.totals.net_profit)}</td>
                        <td className={`py-2 text-right ${data.totals.profit_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{data.totals.profit_margin_percent}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* === Receivables Aging === */}
            {view === 'receivables' && data && (
              <div className="card p-4">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Customer</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3 text-right">Current</th><th className="py-2 pr-3 text-right">31-60</th><th className="py-2 pr-3 text-right">61-90</th><th className="py-2 pr-3 text-right">90+</th></tr></thead>
                  <tbody>{data.map((r: any) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatCurrency(r.total_outstanding)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.current)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.age31_60)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.age61_90)}</td>
                      <td className="py-2 pr-3 text-right text-red-600">{formatCurrency(r.age90plus)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === Payables Aging (same structure) === */}
            {view === 'payables' && data && (
              <div className="card p-4">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Vendor</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3 text-right">Current</th><th className="py-2 pr-3 text-right">31-60</th><th className="py-2 pr-3 text-right">61-90</th><th className="py-2 pr-3 text-right">90+</th></tr></thead>
                  <tbody>{data.map((r: any) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatCurrency(r.total_outstanding)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.current)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.age31_60)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.age61_90)}</td>
                      <td className="py-2 pr-3 text-right text-red-600">{formatCurrency(r.age90plus)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === Inventory Valuation === */}
            {view === 'valuation' && data && (
              <div className="card p-4">
                <div className="flex justify-between mb-3"><span className="text-sm font-medium">Grand Total: <strong>{formatCurrency(data.grand_total)}</strong></span></div>
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Item</th><th className="py-2 pr-3 text-left">Type</th><th className="py-2 pr-3 text-left">Category</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3 text-right">Avg Cost</th><th className="py-2 pr-3 text-right">Total Value</th></tr></thead>
                  <tbody>{data.rows?.map((r: any) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{r.item_type}</td>
                      <td className="py-2 pr-3 text-xs">{r.category_name ?? '-'}</td>
                      <td className="py-2 pr-3 text-right">{r.quantity}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.avg_cost)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatCurrency(r.total_value)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === Low Stock === */}
            {view === 'lowStock' && data && (
              <div className="card p-4">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Item</th><th className="py-2 pr-3 text-left">Type</th><th className="py-2 pr-3 text-right">Current</th><th className="py-2 pr-3 text-right">Reorder</th><th className="py-2 pr-3 text-right">Suggested Order</th></tr></thead>
                  <tbody>{data.map((r: any) => {
                    const suggested = Math.max(0, r.reorder_level * 2 - r.current_stock)
                    return (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3 font-medium">{r.name}</td>
                        <td className="py-2 pr-3 text-xs">{r.item_type.replace(/_/g, ' ')}</td>
                        <td className="py-2 pr-3 text-right text-orange-600 font-medium">{r.current_stock}</td>
                        <td className="py-2 pr-3 text-right">{r.reorder_level}</td>
                        <td className="py-2 pr-3 text-right font-medium text-blue-600">{suggested}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            )}

            {/* === Sales Tax === */}
            {view === 'salesTax' && data && (
              <div className="card p-4">
                <div className="mb-4 grid grid-cols-4 gap-3">
                  <div className="p-2 rounded bg-blue-50"><span className="text-xs text-blue-700">Total Output Tax</span><p className="text-lg font-bold text-blue-700">{formatCurrency(data.totals?.total_output_tax ?? 0)}</p></div>
                  <div className="p-2 rounded bg-orange-50"><span className="text-xs text-orange-700">Total Input Tax</span><p className="text-lg font-bold text-orange-700">{formatCurrency(data.totals?.total_input_tax ?? 0)}</p></div>
                  <div className="p-2 rounded bg-green-50"><span className="text-xs text-green-700">Net Payable</span><p className="text-lg font-bold text-green-700">{formatCurrency(data.totals?.net_payable ?? 0)}</p></div>
                  <div className="p-2 rounded bg-gray-50"><span className="text-xs text-gray-600">Net Sales</span><p className="text-lg font-bold">{formatCurrency(data.totals?.total_sales ?? 0)}</p></div>
                </div>
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Month</th><th className="py-2 pr-3 text-right">Sales</th><th className="py-2 pr-3 text-right">GST Collected</th><th className="py-2 pr-3 text-right">Further Tax</th><th className="py-2 pr-3 text-right">Output Tax</th><th className="py-2 pr-3 text-right">Purchases</th><th className="py-2 pr-3 text-right">GST Paid</th><th className="py-2 text-right">Net Payable</th></tr></thead>
                  <tbody>{data.rows?.map((r: any) => (
                    <tr key={r.month} className="border-b border-gray-50">
                      <td className="py-2 pr-3">{r.month}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.total_sales)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.gst_collected)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.further_tax)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatCurrency(r.total_output_tax)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.total_purchases)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.gst_paid)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(r.net_payable)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === WHT Report === */}
            {view === 'wht' && data && (
              <div className="card p-4">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Month</th><th className="py-2 pr-3 text-right">WHT Receivable</th><th className="py-2 pr-3 text-right">WHT Payable</th><th className="py-2 text-right">Net Position</th></tr></thead>
                  <tbody>{data.rows?.map((r: any) => (
                    <tr key={r.month} className="border-b border-gray-50">
                      <td className="py-2 pr-3">{r.month}</td>
                      <td className="py-2 pr-3 text-right text-green-600">{formatCurrency(r.wht_receivable)}</td>
                      <td className="py-2 pr-3 text-right text-red-600">{formatCurrency(r.wht_payable)}</td>
                      <td className={`py-2 text-right font-medium ${r.net_position >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.net_position)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === Expense Breakdown === */}
            {view === 'expenseBreakdown' && data && (
              <div className="card p-4">
                <div className="flex justify-between mb-3"><span className="text-sm">Grand Total: <strong>{formatCurrency(data.grand_total)}</strong></span></div>
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Category</th><th className="py-2 pr-3 text-left">Type</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 text-right">%</th></tr></thead>
                  <tbody>{data.rows?.map((r: any) => (
                    <tr key={r.category} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium">{r.category}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{r.type}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.total)}</td>
                      <td className="py-2 text-right">{r.pct}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* === Employee Cost === */}
            {view === 'employeeCost' && data && (
              <div className="card p-4">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3 text-left">Employee</th><th className="py-2 pr-3 text-left">Designation</th><th className="py-2 pr-3 text-right">Salary</th><th className="py-2 pr-3 text-right">Project Labor</th><th className="py-2 text-right">Total Cost</th></tr></thead>
                  <tbody>{data.map((r: any) => (
                    <tr key={r.employee_id} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium">{r.employee_name}</td>
                      <td className="py-2 pr-3 text-xs">{r.designation}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.salary)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(r.project_labor)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(r.total_cost)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
