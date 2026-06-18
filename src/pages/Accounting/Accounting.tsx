import { useEffect, useState, useCallback } from 'react'
import { BookOpen, FileText, Scale, TrendingUp, LayoutGrid, Plus, Pencil, Power, PowerOff, Printer, CheckCircle, XCircle, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { COARow, JournalEntryRow, LedgerRow, TrialBalanceRow, PnLStatement, BalanceSheetData } from '../../lib/types.js'

type Tab = 'coa' | 'journal' | 'trial' | 'pnl' | 'bs'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function Accounting() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const settings = useSettingsStore((s) => s.settings)
  const [activeTab, setActiveTab] = useState<Tab>('coa')

  // ============== COA ==============
  const [coaItems, setCoaItems] = useState<COARow[]>([])
  const [showCoaModal, setShowCoaModal] = useState(false)
  const [editingCoa, setEditingCoa] = useState<COARow | null>(null)
  const [coaForm, setCoaForm] = useState<{ account_code: string; account_name: string; account_type: string; parent_id: string | number }>({ account_code: '', account_name: '', account_type: 'asset', parent_id: '' })
  const [togglingCoa, setTogglingCoa] = useState<COARow | null>(null)

  // ============== JOURNAL ==============
  const [journalEntries, setJournalEntries] = useState<JournalEntryRow[]>([])
  const [journalFilters, setJournalFilters] = useState({ date_from: '', date_to: '', account_id: '' as string | number, reference_type: '' })
  const [showManualJE, setShowManualJE] = useState(false)
  const [jeForm, setJeForm] = useState({ date: new Date().toISOString().split('T')[0], description: '' })
  const [jeLines, setJeLines] = useState<Array<{ account_id: string | number; debit: string; credit: string; description: string }>>([{ account_id: '', debit: '', credit: '', description: '' }])
  const [expandedJE, setExpandedJE] = useState<Set<number>>(new Set())

  // GL
  const [glAccountId, setGlAccountId] = useState('' as string | number)
  const [glDateFrom, setGlDateFrom] = useState('')
  const [glDateTo, setGlDateTo] = useState('')
  const [glData, setGlData] = useState<LedgerRow[]>([])

  // ============== TRIAL BALANCE ==============
  const [tbDate, setTbDate] = useState(new Date().toISOString().split('T')[0])
  const [tbData, setTbData] = useState<{ rows: TrialBalanceRow[]; total_debit: number; total_credit: number } | null>(null)

  // ============== P&L ==============
  const [pnlFrom, setPnlFrom] = useState('')
  const [pnlTo, setPnlTo] = useState('')
  const [pnlData, setPnlData] = useState<PnLStatement | null>(null)

  // ============== BALANCE SHEET ==============
  const [bsDate, setBsDate] = useState(new Date().toISOString().split('T')[0])
  const [bsData, setBsData] = useState<BalanceSheetData | null>(null)

  const loadCoa = useCallback(async () => {
    try { setCoaItems(await api.accounting.coa.list()) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load chart of accounts' }) }
  }, [addToast])

  const loadJournal = useCallback(async () => {
    if (!user) return
    try {
      setJournalEntries(await api.accounting.journal.list(user.id, {
        ...(journalFilters.date_from ? { date_from: journalFilters.date_from } : {}),
        ...(journalFilters.date_to ? { date_to: journalFilters.date_to } : {}),
        ...(journalFilters.account_id ? { account_id: Number(journalFilters.account_id) } : {}),
        ...(journalFilters.reference_type ? { reference_type: journalFilters.reference_type } : {}),
      }))
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load journal entries' }) }
  }, [user, journalFilters, addToast])

  useEffect(() => { loadCoa() }, [loadCoa])
  useEffect(() => { if (activeTab === 'journal') loadJournal() }, [activeTab, loadJournal])

  // ============== COA HANDLERS ==============
  const handleCoaSubmit = async () => {
    if (!user) return
    if (!coaForm.account_code || !coaForm.account_name) { addToast({ type: 'warning', title: 'Validation', message: 'Code and name are required' }); return }
    try {
      if (editingCoa) {
        await api.accounting.coa.update(user.id, editingCoa.id, {
          account_name: coaForm.account_name,
          account_type: coaForm.account_type,
          parent_id: coaForm.parent_id ? Number(coaForm.parent_id) : null,
        })
        addToast({ type: 'success', title: 'Updated', message: 'Account updated' })
      } else {
        await api.accounting.coa.create(user.id, {
          account_code: coaForm.account_code, account_name: coaForm.account_name,
          account_type: coaForm.account_type, parent_id: coaForm.parent_id ? Number(coaForm.parent_id) : undefined,
        })
        addToast({ type: 'success', title: 'Created', message: 'Account created' })
      }
      setShowCoaModal(false); loadCoa()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleCoaToggle = async () => {
    if (!user || !togglingCoa) return
    try {
      await api.accounting.coa.toggleActive(user.id, togglingCoa.id)
      addToast({ type: 'success', title: 'Updated', message: `Account ${togglingCoa.is_active ? 'deactivated' : 'activated'}` })
      setTogglingCoa(null); loadCoa()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  // ============== JOURNAL HANDLERS ==============
  const totalDebit = round2(jeLines.reduce((s, l) => s + (Number(l.debit) || 0), 0))
  const totalCredit = round2(jeLines.reduce((s, l) => s + (Number(l.credit) || 0), 0))
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && jeLines.length >= 2

  const handleJECreate = async () => {
    if (!user) return
    if (!jeForm.description) { addToast({ type: 'warning', title: 'Validation', message: 'Description is required' }); return }
    if (!isBalanced) { addToast({ type: 'warning', title: 'Validation', message: 'Debits must equal credits' }); return }
    try {
      const r = await api.accounting.journal.create(user.id, {
        date: jeForm.date, description: jeForm.description,
        lines: jeLines.filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)).map((l) => ({
          account_id: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
          description: l.description || undefined,
        })),
      })
      addToast({ type: 'success', title: 'Created', message: `JE ${r.entry_number} recorded` })
      setShowManualJE(false); loadJournal()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const loadGL = async () => {
    if (!user || !glAccountId) return
    try {
      setGlData(await api.accounting.ledger(user.id, {
        account_id: Number(glAccountId), date_from: glDateFrom || undefined, date_to: glDateTo || undefined,
      }))
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load general ledger' }) }
  }

  const loadTB = async () => {
    if (!user) return
    try { setTbData(await api.accounting.trialBalance(user.id, tbDate)) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load trial balance' }) }
  }

  const loadPnL = async () => {
    if (!user || !pnlFrom || !pnlTo) { addToast({ type: 'warning', title: 'Validation', message: 'Date range is required' }); return }
    try { setPnlData(await api.accounting.pnl(user.id, { date_from: pnlFrom, date_to: pnlTo })) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load P&L' }) }
  }

  const loadBS = async () => {
    if (!user) return
    try { setBsData(await api.accounting.balanceSheet(user.id, bsDate)) }
    catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load balance sheet' }) }
  }

  const coaOpts = coaItems.map((a) => ({ value: a.id, label: `${a.account_code} - ${a.account_name}` }))
  const coaParentOpts = [{ value: '', label: 'None (Root)' }, ...coaOpts]

  const typeColors: Record<string, string> = { asset: 'text-blue-600', liability: 'text-orange-600', equity: 'text-purple-600', income: 'text-green-600', expense: 'text-red-600' }

  const addJELine = () => setJeLines([...jeLines, { account_id: '', debit: '', credit: '', description: '' }])
  const removeJELine = (i: number) => setJeLines(jeLines.filter((_, j) => j !== i))
  const updJELine = (i: number, f: string, v: string | number) => { const n = [...jeLines]; n[i] = { ...n[i], [f]: v }; setJeLines(n) }

  const printStatement = (title: string, html: string) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>body{font-family:Arial;padding:40px;font-size:12px;max-width:900px;margin:auto}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
th{background:#f5f5f5}.right{text-align:right}.bold{font-weight:bold}.header{text-align:center;margin-bottom:30px}
.net{font-size:14px;font-weight:bold}.total-row{font-weight:bold;border-top:2px solid #000}</style></head><body>
<div class="header"><h2>${settings.company_name || 'HVAC ERP'}</h2><h3>${title}</h3></div>
${html}
<p style="text-align:center;margin-top:40px;color:#999">Generated on ${new Date().toLocaleDateString()}</p>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div>
      <PageHeader title="Accounting" subtitle="Chart of accounts, journal entries, and financial statements" />

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          {[
            { id: 'coa' as Tab, label: 'Chart of Accounts', icon: BookOpen },
            { id: 'journal' as Tab, label: 'Journal / GL', icon: FileText },
            { id: 'trial' as Tab, label: 'Trial Balance', icon: Scale },
            { id: 'pnl' as Tab, label: 'P&L', icon: TrendingUp },
            { id: 'bs' as Tab, label: 'Balance Sheet', icon: LayoutGrid },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${activeTab === tab.id ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500'}`}>
                <Icon size={16} /> {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-6">
        {/* CHART OF ACCOUNTS */}
        {activeTab === 'coa' && (
          <div>
            <div className="mb-4 flex justify-end">
              <button onClick={() => { setEditingCoa(null); setCoaForm({ account_code: '', account_name: '', account_type: 'asset', parent_id: '' }); setShowCoaModal(true) }} className="btn-primary gap-2"><Plus size={16} /> New Account</button>
            </div>
            <div className="space-y-4">
              {['asset', 'liability', 'equity', 'income', 'expense'].map((type) => {
                const items = coaItems.filter((a) => a.account_type === type)
                if (items.length === 0) return null
                return (
                  <div key={type} className="card">
                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${typeColors[type]}`}>{type}s</h4>
                    <table className="min-w-full text-sm">
                      <thead><tr className="border-b text-xs text-gray-500"><th className="py-1 pr-4 text-left">Code</th><th className="py-1 pr-4 text-left">Name</th><th className="py-1 pr-4 text-left">Parent</th><th className="py-1 pr-4 text-left">Status</th><th className="py-1"></th></tr></thead>
                      <tbody>
                        {items.map((a) => {
                          const parent = coaItems.find((p) => p.id === a.parent_id)
                          return (
                            <tr key={a.id} className="border-b border-gray-50">
                              <td className="py-2 pr-4 font-mono text-xs">{a.account_code}</td>
                              <td className="py-2 pr-4">{a.account_name}</td>
                              <td className="py-2 pr-4 text-xs text-gray-500">{parent ? `${parent.account_code} - ${parent.account_name}` : '-'}</td>
                              <td className="py-2 pr-4">
                                {a.has_transactions ? <span className="text-xs text-gray-400">Has Tx</span> : <span className="text-xs text-green-600">Active</span>}
                              </td>
                              <td className="py-2">
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => { setEditingCoa(a); setCoaForm({ ...a, parent_id: a.parent_id ?? '' as string | number }); setShowCoaModal(true) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                                  <button onClick={() => setTogglingCoa(a)} className="rounded p-1 text-gray-400 hover:text-gray-600">{a.is_active ? <PowerOff size={14} /> : <Power size={14} />}</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* JOURNAL / GL */}
        {activeTab === 'journal' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <input type="date" value={journalFilters.date_from} onChange={(e) => setJournalFilters({ ...journalFilters, date_from: e.target.value })} className="input-field text-sm w-36" />
              <input type="date" value={journalFilters.date_to} onChange={(e) => setJournalFilters({ ...journalFilters, date_to: e.target.value })} className="input-field text-sm w-36" />
              <select value={journalFilters.account_id} onChange={(e) => setJournalFilters({ ...journalFilters, account_id: e.target.value })} className="input-field text-sm w-48">
                <option value="">All Accounts</option>
                {coaOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={loadJournal} className="btn-primary text-sm !py-2">Filter</button>
              <button onClick={() => { setShowManualJE(true); setJeForm({ date: new Date().toISOString().split('T')[0], description: '' }); setJeLines([{ account_id: '', debit: '', credit: '', description: '' }]) }} className="btn-primary gap-2 ml-auto"><Plus size={16} /> Manual JE</button>
            </div>

            {/* GL tab toggle */}
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">General Ledger:</span>
              <select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className="input-field text-sm w-48">
                <option value="">Select account</option>
                {coaOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="date" value={glDateFrom} onChange={(e) => setGlDateFrom(e.target.value)} className="input-field text-sm w-32" />
              <input type="date" value={glDateTo} onChange={(e) => setGlDateTo(e.target.value)} className="input-field text-sm w-32" />
              <button onClick={loadGL} className="btn-secondary text-sm !py-2">View Ledger</button>
            </div>

            {/* GL Results */}
            {glData.length > 0 && (
              <div className="card p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">General Ledger: {glData[0]?.account_name} ({glData[0]?.account_code})</h4>
                <table className="min-w-full text-xs">
                  <thead><tr className="border-b text-gray-500"><th className="py-1 pr-3 text-left">Date</th><th className="py-1 pr-3 text-left">Entry #</th><th className="py-1 pr-3 text-left">Description</th><th className="py-1 pr-3 text-right">Debit</th><th className="py-1 pr-3 text-right">Credit</th><th className="py-1 text-right">Balance</th></tr></thead>
                  <tbody>
                    {glData.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1 pr-3">{formatDate(r.date)}</td>
                        <td className="py-1 pr-3 font-mono">{r.entry_number}</td>
                        <td className="py-1 pr-3">{r.je_description ?? ''}</td>
                        <td className="py-1 pr-3 text-right">{r.debit > 0 ? formatCurrency(r.debit) : '-'}</td>
                        <td className="py-1 pr-3 text-right">{r.credit > 0 ? formatCurrency(r.credit) : '-'}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(r.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Journal entries list */}
            {journalEntries.map((je) => (
              <div key={je.id} className="card p-4 mb-3">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => { const s = new Set(expandedJE); s.has(je.id) ? s.delete(je.id) : s.add(je.id); setExpandedJE(s) }}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{je.entry_number}</span>
                    <span className="text-xs text-gray-500">{formatDate(je.date)}</span>
                    <span className="text-sm">{je.description}</span>
                    <span className="text-xs text-gray-400">{je.reference_type ? `${je.reference_type}#${je.reference_id}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{je.created_by_name ?? ''}</span>
                    <span className={`text-xs ${expandedJE.has(je.id) ? 'text-navy-600' : 'text-gray-400'}`}>{expandedJE.has(je.id) ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expandedJE.has(je.id) && (
                  <table className="min-w-full text-xs mt-2">
                    <thead><tr className="border-b text-gray-500"><th className="py-1 pr-3 text-left">Account</th><th className="py-1 pr-3 text-left">Code</th><th className="py-1 pr-3 text-left">Type</th><th className="py-1 pr-3 text-right">Debit</th><th className="py-1 pr-3 text-right">Credit</th><th className="py-1 text-left">Description</th></tr></thead>
                    <tbody>
                      {(je.lines || []).map((line) => (
                        <tr key={line.id} className="border-b border-gray-50">
                          <td className="py-1 pr-3">{line.account_name}</td>
                          <td className="py-1 pr-3 font-mono">{line.account_code}</td>
                          <td className={`py-1 pr-3 ${typeColors[line.account_type] ?? ''}`}>{line.account_type}</td>
                          <td className="py-1 pr-3 text-right">{line.debit > 0 ? formatCurrency(line.debit) : '-'}</td>
                          <td className="py-1 pr-3 text-right">{line.credit > 0 ? formatCurrency(line.credit) : '-'}</td>
                          <td className="py-1">{line.description ?? ''}</td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t-2">
                        <td colSpan={3} className="py-1 pr-3 text-right">Total</td>
                        <td className="py-1 pr-3 text-right">{formatCurrency(je.lines?.reduce((s, l) => s + l.debit, 0) ?? 0)}</td>
                        <td className="py-1 pr-3 text-right">{formatCurrency(je.lines?.reduce((s, l) => s + l.credit, 0) ?? 0)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            {/* Manual JE Modal */}
            <FormModal open={showManualJE} title="New Manual Journal Entry" onClose={() => setShowManualJE(false)} onSubmit={handleJECreate} submitLabel="Post Entry">
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Date</label><input type="date" value={jeForm.date} onChange={(e) => setJeForm({ ...jeForm, date: e.target.value })} className="input-field" /></div>
                <div className="md:col-span-2"><label className="label-text mb-1">Description *</label><input value={jeForm.description} onChange={(e) => setJeForm({ ...jeForm, description: e.target.value })} className="input-field" /></div>
              </div>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Journal Lines</span>
                  <button onClick={addJELine} className="btn-secondary !py-1 !px-2 text-xs gap-1"><Plus size={12} /> Add Line</button>
                </div>
                <table className="min-w-full text-xs">
                  <thead><tr className="border-b text-gray-500"><th className="py-1 pr-2">Account</th><th className="py-1 pr-2 w-20 text-right">Debit</th><th className="py-1 pr-2 w-20 text-right">Credit</th><th className="py-1 pr-2">Description</th><th className="w-6"></th></tr></thead>
                  <tbody>
                    {jeLines.map((l, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1 pr-2"><SearchableSelect options={coaOpts} value={l.account_id} onChange={(v) => updJELine(i, 'account_id', v)} placeholder="Account" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => updJELine(i, 'debit', e.target.value)} className="input-field text-xs w-full text-right" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => updJELine(i, 'credit', e.target.value)} className="input-field text-xs w-full text-right" /></td>
                        <td className="py-1 pr-2"><input value={l.description} onChange={(e) => updJELine(i, 'description', e.target.value)} className="input-field text-xs w-full" /></td>
                        <td className="py-1">{jeLines.length > 2 && <button onClick={() => removeJELine(i)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-2 text-sm font-medium">
                  <span>Total: Debits {formatCurrency(totalDebit)} / Credits {formatCurrency(totalCredit)}</span>
                  {isBalanced ? (
                    <span className="flex items-center gap-1 text-green-600"><CheckCircle size={14} /> Balanced</span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600"><XCircle size={14} /> Unbalanced</span>
                  )}
                </div>
              </div>
            </FormModal>
          </div>
        )}

        {/* TRIAL BALANCE */}
        {activeTab === 'trial' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-600">As of Date:</label>
              <input type="date" value={tbDate} onChange={(e) => setTbDate(e.target.value)} className="input-field text-sm w-40" />
              <button onClick={loadTB} className="btn-primary">Generate Trial Balance</button>
              {tbData && <button onClick={() => {
                const rows = tbData.rows.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${r.closing_debit > 0 ? formatCurrency(r.closing_debit) : '-'}</td><td class="right">${r.closing_credit > 0 ? formatCurrency(r.closing_credit) : '-'}</td></tr>`).join('')
                printStatement('Trial Balance', `<table><thead><tr><th>Code</th><th>Account</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="2">Total</td><td class="right">${formatCurrency(tbData.total_debit)}</td><td class="right">${formatCurrency(tbData.total_credit)}</td></tr></tbody></table>`)
              }} className="btn-secondary gap-2 ml-4"><Printer size={14} /> Print</button>}
            </div>
            {tbData && (
              <div className="card p-4">
                <div className="flex justify-between mb-3 text-xs font-medium"><span className="text-gray-500">Trial Balance as of {formatDate(tbDate)}</span><span className={tbData.total_debit === tbData.total_credit ? 'text-green-600' : 'text-red-600'}>{tbData.total_debit === tbData.total_credit ? '✓ Balanced' : '✗ Not Balanced!'}</span></div>
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-2 pr-4">Code</th><th className="py-2 pr-4">Account</th><th className="py-2 pr-4 text-right">Debit</th><th className="py-2 text-right">Credit</th></tr></thead>
                  <tbody>
                    {tbData.rows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-mono text-xs">{r.account_code}</td>
                        <td className="py-2 pr-4">
                          <span className={typeColors[r.account_type] ?? ''}>{r.account_name}</span>
                          <span className="text-xs text-gray-400 ml-2">({r.account_type})</span>
                        </td>
                        <td className="py-2 pr-4 text-right">{r.closing_debit > 0 ? formatCurrency(r.closing_debit) : '-'}</td>
                        <td className="py-2 text-right">{r.closing_credit > 0 ? formatCurrency(r.closing_credit) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t-2 border-gray-800">
                      <td colSpan={2} className="py-2 pr-4">Total</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(tbData.total_debit)}</td>
                      <td className="py-2 text-right">{formatCurrency(tbData.total_credit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* P&L */}
        {activeTab === 'pnl' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-600">From:</label>
              <input type="date" value={pnlFrom} onChange={(e) => setPnlFrom(e.target.value)} className="input-field text-sm w-40" />
              <label className="text-sm text-gray-600">To:</label>
              <input type="date" value={pnlTo} onChange={(e) => setPnlTo(e.target.value)} className="input-field text-sm w-40" />
              <button onClick={loadPnL} className="btn-primary">Generate P&L</button>
              {pnlData && <button onClick={() => {
                const income = pnlData.income.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')
                const expenses = pnlData.expenses.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')
                printStatement('Profit & Loss Statement', `
<table><thead><tr><th>Code</th><th></th><th class="right">Amount</th></tr></thead><tbody>
<tr class="total-row"><td colspan="2">Revenue</td><td class="right">${formatCurrency(pnlData.total_income)}</td></tr>${income}
<tr class="total-row"><td colspan="2">Total Revenue</td><td class="right">${formatCurrency(pnlData.total_income)}</td></tr>
<tr><td colspan="3" style="height:10px"></td></tr>
<tr class="total-row"><td colspan="2">Expenses</td><td class="right">${formatCurrency(pnlData.total_expenses)}</td></tr>${expenses}
<tr class="total-row"><td colspan="2">Total Expenses</td><td class="right">${formatCurrency(pnlData.total_expenses)}</td></tr>
<tr><td colspan="3" style="height:10px"></td></tr>
<tr class="total-row" style="font-size:14px"><td colspan="2">Net ${pnlData.net_profit >= 0 ? 'Profit' : 'Loss'}</td><td class="right">${formatCurrency(pnlData.net_profit)}</td></tr>
</tbody></table>`)
              }} className="btn-secondary gap-2 ml-4"><Printer size={14} /> Print</button>}
            </div>
            {pnlData && (
              <div className="card p-4 max-w-xl">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Profit & Loss: {formatDate(pnlFrom)} to {formatDate(pnlTo)}</h4>
                <div className="text-sm space-y-1">
                  <div className="font-bold border-b pb-1 text-green-700">Revenue</div>
                  {pnlData.income.map((r) => <div key={r.account_code} className="flex justify-between pl-4"><span>{r.account_name}</span><span>{formatCurrency(r.balance)}</span></div>)}
                  <div className="flex justify-between font-bold border-b pt-1"><span>Total Revenue</span><span className="text-green-700">{formatCurrency(pnlData.total_income)}</span></div>

                  <div className="font-bold pt-2 border-b pb-1 text-red-700">Expenses</div>
                  {pnlData.expenses.map((r) => <div key={r.account_code} className="flex justify-between pl-4"><span>{r.account_name}</span><span>{formatCurrency(r.balance)}</span></div>)}
                  <div className="flex justify-between font-bold border-b pt-1"><span>Total Expenses</span><span className="text-red-700">{formatCurrency(pnlData.total_expenses)}</span></div>

                  <div className={`flex justify-between pt-3 text-base font-bold ${pnlData.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    <span>Net {pnlData.net_profit >= 0 ? 'Profit' : 'Loss'}</span>
                    <span>{formatCurrency(pnlData.net_profit)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BALANCE SHEET */}
        {activeTab === 'bs' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-600">As of Date:</label>
              <input type="date" value={bsDate} onChange={(e) => setBsDate(e.target.value)} className="input-field text-sm w-40" />
              <button onClick={loadBS} className="btn-primary">Generate Balance Sheet</button>
              {bsData && <button onClick={() => {
                const assets = bsData.assets.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')
                const liab = bsData.liabilities.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')
                const eq = bsData.equity.map((r) => `<tr><td>${r.account_code}</td><td>${r.account_name}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')
                printStatement('Balance Sheet', `
<h4>Assets</h4><table><thead><tr><th>Code</th><th></th><th class="right">Amount</th></tr></thead><tbody>${assets}
<tr class="total-row"><td colspan="2">Total Assets</td><td class="right">${formatCurrency(bsData.total_assets)}</td></tr></tbody></table>
<div style="height:20px"></div>
<h4>Liabilities & Equity</h4><table><thead><tr><th>Code</th><th></th><th class="right">Amount</th></tr></thead><tbody>
<tr class="total-row"><td colspan="2">Liabilities</td><td class="right">${formatCurrency(bsData.total_liabilities)}</td></tr>${liab}
<tr style="height:10px"></tr>
<tr class="total-row"><td colspan="2">Equity</td><td class="right">${formatCurrency(bsData.total_equity)}</td></tr>${eq}
<tr><td></td><td>Net Profit (Retained Earnings)</td><td class="right">${formatCurrency(bsData.net_profit)}</td></tr>
<tr class="total-row" style="font-size:14px"><td colspan="2">Total Liabilities & Equity</td><td class="right">${formatCurrency(bsData.total_liabilities_equity)}</td></tr>
${Math.abs(bsData.total_assets - bsData.total_liabilities_equity) < 0.01 ? `<tr style="color:green"><td colspan="3" style="text-align:center;padding-top:10px">✓ Balance Sheet is balanced</td></tr>` : `<tr style="color:red"><td colspan="3" style="text-align:center;padding-top:10px">✗ Difference: ${formatCurrency(bsData.total_assets - bsData.total_liabilities_equity)}</td></tr>`}
</tbody></table>`)
              }} className="btn-secondary gap-2 ml-4"><Printer size={14} /> Print</button>}
            </div>
            {bsData && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="card p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Assets</h4>
                  <div className="text-sm space-y-1">
                    {bsData.assets.map((r) => (
                      <div key={r.account_code} className="flex justify-between"><span>{r.account_name}</span><span>{formatCurrency(r.balance)}</span></div>
                    ))}
                    <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>Total Assets</span><span className="text-blue-700">{formatCurrency(bsData.total_assets)}</span></div>
                  </div>
                </div>
                <div className="card p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Liabilities & Equity</h4>
                  <div className="text-sm space-y-1">
                    <div className="font-medium text-orange-600 border-b pb-1">Liabilities</div>
                    {bsData.liabilities.map((r) => (
                      <div key={r.account_code} className="flex justify-between pl-4"><span>{r.account_name}</span><span>{formatCurrency(r.balance)}</span></div>
                    ))}
                    <div className="flex justify-between font-medium"><span className="pl-4">Total Liabilities</span><span>{formatCurrency(bsData.total_liabilities)}</span></div>

                    <div className="font-medium text-purple-600 border-b pb-1 mt-3">Equity</div>
                    {bsData.equity.map((r) => (
                      <div key={r.account_code} className="flex justify-between pl-4"><span>{r.account_name}</span><span>{formatCurrency(r.balance)}</span></div>
                    ))}
                    <div className="flex justify-between pl-4"><span>Net Profit (Retained Earnings)</span><span>{formatCurrency(bsData.net_profit)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>Total Liabilities & Equity</span><span className="text-purple-700">{formatCurrency(bsData.total_liabilities_equity)}</span></div>
                  </div>
                  <div className={`mt-3 text-center text-xs font-medium ${Math.abs(bsData.total_assets - bsData.total_liabilities_equity) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(bsData.total_assets - bsData.total_liabilities_equity) < 0.01 ? '✓ Balance Sheet is balanced' : `✗ Difference: ${formatCurrency(bsData.total_assets - bsData.total_liabilities_equity)}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* COA Modal */}
      <FormModal open={showCoaModal} title={editingCoa ? 'Edit Account' : 'New Account'} onClose={() => setShowCoaModal(false)} onSubmit={handleCoaSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Account Code *</label><input value={coaForm.account_code} onChange={(e) => setCoaForm({ ...coaForm, account_code: e.target.value })} className="input-field" disabled={!!editingCoa} /></div>
          <div><label className="label-text mb-1">Account Name *</label><input value={coaForm.account_name} onChange={(e) => setCoaForm({ ...coaForm, account_name: e.target.value })} className="input-field" /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Type</label><select value={coaForm.account_type} onChange={(e) => setCoaForm({ ...coaForm, account_type: e.target.value })} className="input-field"><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></select></div>
          <SearchableSelect label="Parent Account" options={coaParentOpts} value={coaForm.parent_id} onChange={(v) => setCoaForm({ ...coaForm, parent_id: v })} placeholder="Root" />
        </div>
      </FormModal>

      <ConfirmDialog open={!!togglingCoa} title={togglingCoa?.is_active ? 'Deactivate Account' : 'Activate Account'} message={`${togglingCoa?.is_active ? 'Deactivate' : 'Activate'} "${togglingCoa?.account_name}"? ${togglingCoa?.is_active && togglingCoa?.has_transactions ? 'Accounts with transactions cannot be deactivated.' : ''}`} onConfirm={handleCoaToggle} onCancel={() => setTogglingCoa(null)} />
    </div>
  )
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white">Confirm</button>
        </div>
      </div>
    </div>
  )
}
