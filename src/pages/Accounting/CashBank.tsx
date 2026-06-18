import { useEffect, useState, useCallback } from 'react'
import { Landmark, Wallet, Plus, ArrowRightLeft, Eye, Printer, Power, PowerOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import type { CashAccount, BankAccount, CashBankTransaction } from '../../lib/types.js'

type ViewMode = 'overview' | 'detail' | 'manage'

export default function CashBank() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)

  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [balances, setBalances] = useState<{ cash: CashAccount[]; bank: BankAccount[]; total_cash_position: number } | null>(null)

  // Detail view
  const [detailAccount, setDetailAccount] = useState<{ type: string; id: number; name: string } | null>(null)
  const [transactions, setTransactions] = useState<CashBankTransaction[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // New account forms
  const [showBankForm, setShowBankForm] = useState(false)
  const [bankForm, setBankForm] = useState({ account_name: '', bank_name: '', account_number: '', branch: '', opening_balance: '' })
  const [showCashForm, setShowCashForm] = useState(false)
  const [cashForm, setCashForm] = useState({ account_name: '', opening_balance: '' })

  // Manual transaction
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({ account_type: 'cash', account_id: '' as string | number, date: new Date().toISOString().split('T')[0], transaction_type: 'receipt', amount: '', description: '', category: 'other' })

  // Transfer
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferForm, setTransferForm] = useState({ from_type: 'cash', from_id: '' as string | number, to_type: 'bank', to_id: '' as string | number, amount: '', date: new Date().toISOString().split('T')[0], description: '' })

  // Toggle
  const [toggling, setToggling] = useState<any>(null)

  const accountOpts = (type: string) => {
    if (type === 'cash') return (balances?.cash ?? []).map((a) => ({ value: a.id, label: `${a.account_name} (${formatCurrency(a.current_balance)})` }))
    return (balances?.bank ?? []).map((a) => ({ value: a.id, label: `${a.account_name} (${formatCurrency(a.current_balance)})` }))
  }

  const loadBalances = useCallback(async () => {
    try { setBalances(await api.cashbank.balances()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadBalances() }, [loadBalances])

  const viewDetail = async (type: string, id: number, name: string) => {
    setDetailAccount({ type, id, name })
    try {
      const t = await api.cashbank.transactions(user!.id, {
        account_type: type, account_id: id,
        date_from: dateFrom || undefined, date_to: dateTo || undefined,
      })
      setTransactions(t)
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load transactions' }) }
  }

  const handleBankCreate = async () => {
    if (!user || !bankForm.account_name) { addToast({ type: 'warning', title: 'Validation', message: 'Account name is required' }); return }
    try {
      await api.cashbank.bank.create(user.id, { ...bankForm, opening_balance: Number(bankForm.opening_balance) || 0 })
      addToast({ type: 'success', title: 'Created', message: 'Bank account created' })
      setShowBankForm(false); loadBalances()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleCashCreate = async () => {
    if (!user || !cashForm.account_name) { addToast({ type: 'warning', title: 'Validation', message: 'Account name is required' }); return }
    try {
      await api.cashbank.cash.create(user.id, { ...cashForm, opening_balance: Number(cashForm.opening_balance) || 0 })
      addToast({ type: 'success', title: 'Created', message: 'Cash account created' })
      setShowCashForm(false); loadBalances()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleManual = async () => {
    if (!user || !manualForm.account_id || !manualForm.amount) {
      addToast({ type: 'warning', title: 'Validation', message: 'Account, amount, and date are required' }); return
    }
    try {
      await api.cashbank.manualTransaction(user.id, {
        account_type: manualForm.account_type, account_id: Number(manualForm.account_id),
        date: manualForm.date, transaction_type: manualForm.transaction_type,
        amount: Number(manualForm.amount), description: manualForm.description || undefined,
        category: manualForm.category,
      })
      addToast({ type: 'success', title: 'Recorded', message: 'Manual transaction recorded' })
      setShowManual(false); loadBalances()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleTransfer = async () => {
    if (!user || !transferForm.from_id || !transferForm.to_id || !transferForm.amount) {
      addToast({ type: 'warning', title: 'Validation', message: 'Both accounts and amount are required' }); return
    }
    if (transferForm.from_type === transferForm.to_type && transferForm.from_id === transferForm.to_id) {
      addToast({ type: 'warning', title: 'Error', message: 'Cannot transfer to the same account' }); return
    }
    try {
      await api.cashbank.transfer(user.id, {
        from_type: transferForm.from_type, from_id: Number(transferForm.from_id),
        to_type: transferForm.to_type, to_id: Number(transferForm.to_id),
        amount: Number(transferForm.amount), date: transferForm.date,
        description: transferForm.description || undefined,
      })
      addToast({ type: 'success', title: 'Transferred', message: 'Funds transferred' })
      setShowTransfer(false); loadBalances()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const handleToggle = async () => {
    if (!user || !toggling) return
    try {
      if (toggling.type === 'bank') {
        await api.cashbank.bank.toggleActive(user.id, toggling.id)
      } else {
        await api.cashbank.cash.toggleActive(user.id, toggling.id)
      }
      addToast({ type: 'success', title: 'Updated', message: `Account ${toggling.is_active ? 'deactivated' : 'activated'}` })
      setToggling(null); loadBalances()
    } catch (err) { addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const printStatement = () => {
    if (!detailAccount || !transactions.length) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Statement - ${detailAccount.name}</title>
<style>body{font-family:Arial;padding:40px;font-size:12px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}.right{text-align:right}.bold{font-weight:bold}</style></head><body>
<h2>Account Statement</h2><p><strong>${detailAccount.name}</strong> (${detailAccount.type})</p>
<table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="right">Receipts</th><th class="right">Payments</th><th class="right">Balance</th></tr></thead><tbody>
${transactions.map((t) => {
  const isReceipt = t.transaction_type === 'receipt' || t.transaction_type === 'transfer_in'
  return `<tr><td>${formatDate(t.date)}</td><td>${t.transaction_type.replace(/_/g, ' ')}</td><td>${t.description ?? '-'}</td><td class="right">${isReceipt ? formatCurrency(Math.abs(t.amount)) : '-'}</td><td class="right">${!isReceipt ? formatCurrency(Math.abs(t.amount)) : '-'}</td><td class="right">${formatCurrency(t.balance_after)}</td></tr>`
}).join('')}</tbody></table></body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const allAccountCards = [
    ...(balances?.cash ?? []).map((a) => ({ ...a, type: 'cash', typeLabel: 'Cash' })),
    ...(balances?.bank ?? []).map((a) => ({ ...a, type: 'bank', typeLabel: 'Bank' })),
  ]

  return (
    <div>
      <PageHeader title="Cash & Bank" subtitle="Manage accounts, view transactions, and transfer funds">
        <div className="flex gap-2">
          <button onClick={() => { setViewMode(viewMode === 'manage' ? 'overview' : 'manage') }} className="btn-secondary gap-2">
            {viewMode === 'manage' ? 'Back' : 'Manage Accounts'}
          </button>
          <button onClick={() => { setManualForm({ ...manualForm, date: new Date().toISOString().split('T')[0] }); setShowManual(true) }} className="btn-secondary gap-2"><Plus size={16} /> Manual Entry</button>
          <button onClick={() => { setTransferForm({ ...transferForm, date: new Date().toISOString().split('T')[0] }); setShowTransfer(true) }} className="btn-primary gap-2"><ArrowRightLeft size={16} /> Transfer</button>
        </div>
      </PageHeader>

      <div className="mt-6">
        {/* Manage Accounts */}
        {viewMode === 'manage' && (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Wallet size={16} /> Cash Accounts</h3>
                <button onClick={() => setShowCashForm(true)} className="btn-primary gap-2 !py-1 !px-2 text-xs"><Plus size={12} /> Add Cash</button>
              </div>
              <DataTable
                data={balances?.cash ?? []}
                columns={[
                  { key: 'account_name', header: 'Name' },
                  { key: 'current_balance', header: 'Balance', render: (r) => formatCurrency(r.current_balance) },
                  { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
                  { key: 'id', header: '', render: (r) => (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setToggling({ ...r, type: 'cash' })} className="rounded p-1 text-gray-400">{r.is_active ? <PowerOff size={14} /> : <Power size={14} />}</button>
                    </div>
                  )},
                ]}
              />
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Landmark size={16} /> Bank Accounts</h3>
                <button onClick={() => setShowBankForm(true)} className="btn-primary gap-2 !py-1 !px-2 text-xs"><Plus size={12} /> Add Bank</button>
              </div>
              <DataTable
                data={balances?.bank ?? []}
                columns={[
                  { key: 'account_name', header: 'Name' },
                  { key: 'bank_name', header: 'Bank', render: (r) => r.bank_name ?? '-' },
                  { key: 'account_number', header: 'Account #', render: (r) => r.account_number ?? '-' },
                  { key: 'current_balance', header: 'Balance', render: (r) => formatCurrency(r.current_balance) },
                  { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
                  { key: 'id', header: '', render: (r) => (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setToggling({ ...r, type: 'bank' })} className="rounded p-1 text-gray-400">{r.is_active ? <PowerOff size={14} /> : <Power size={14} />}</button>
                    </div>
                  )},
                ]}
              />
            </div>
          </div>
        )}

        {/* Overview */}
        {viewMode === 'overview' && !detailAccount && (
          <div>
            <div className="card p-6 mb-6 text-center">
              <p className="text-sm text-gray-500 mb-1">Total Cash & Bank Position</p>
              <p className="text-3xl font-bold text-navy-800">{formatCurrency(balances?.total_cash_position ?? 0)}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {allAccountCards.map((acc) => (
                <div key={`${acc.type}-${acc.id}`} className="card p-4 cursor-pointer hover:shadow-md transition" onClick={() => viewDetail(acc.type, acc.id, acc.account_name)}>
                  <div className="flex items-center gap-2 mb-2">
                    {acc.type === 'cash' ? <Wallet size={18} className="text-green-600" /> : <Landmark size={18} className="text-blue-600" />}
                    <span className="text-sm font-medium text-gray-900">{acc.account_name}</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(acc.current_balance)}</p>
                  <p className="text-xs text-gray-500 mt-1">{acc.typeLabel} {!acc.is_active ? '(Inactive)' : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail */}
        {detailAccount && (
          <div>
            <button onClick={() => { setDetailAccount(null); setTransactions([]) }} className="mb-4 text-sm text-gray-500 hover:text-gray-700">&larr; Back to Overview</button>
            <div className="card p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detailAccount.name}</h3>
                  <p className="text-sm text-gray-500">{detailAccount.type === 'cash' ? 'Cash Account' : 'Bank Account'}</p>
                </div>
                <button onClick={printStatement} className="btn-secondary gap-2"><Printer size={16} /> Print Statement</button>
              </div>
            </div>
            <div className="flex gap-3 mb-4">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm w-36" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm w-36" />
              <button onClick={() => detailAccount && viewDetail(detailAccount.type, detailAccount.id, detailAccount.name)} className="btn-primary text-sm !py-2">Filter</button>
            </div>
            <DataTable
              data={transactions}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'transaction_type', header: 'Type', render: (r) => {
                  const colors: Record<string, string> = { receipt: 'text-green-600', payment: 'text-red-600', transfer_in: 'text-blue-600', transfer_out: 'text-orange-600' }
                  return <span className={`font-medium ${colors[r.transaction_type] ?? ''}`}>{r.transaction_type.replace(/_/g, ' ')}</span>
                }},
                { key: 'description', header: 'Description', render: (r) => r.description ?? '-' },
                { key: 'reference_type', header: 'Reference', render: (r) => r.reference_type ? `${r.reference_type} #${r.reference_id ?? ''}` : '-' },
                { key: 'amount', header: 'Receipts', render: (r) => {
                  const isR = r.transaction_type === 'receipt' || r.transaction_type === 'transfer_in'
                  return isR ? <span className="text-green-600 font-medium">{formatCurrency(Math.abs(r.amount))}</span> : '-'
                }},
                { key: 'amount', header: 'Payments', render: (r) => {
                  const isP = r.transaction_type === 'payment' || r.transaction_type === 'transfer_out'
                  return isP ? <span className="text-red-600 font-medium">{formatCurrency(Math.abs(r.amount))}</span> : '-'
                }},
                { key: 'balance_after', header: 'Balance', render: (r) => <span className="font-bold">{formatCurrency(r.balance_after)}</span> },
              ]}
            />
          </div>
        )}
      </div>

      {/* Forms */}
      <FormModal open={showBankForm} title="New Bank Account" onClose={() => setShowBankForm(false)} onSubmit={handleBankCreate}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label-text mb-1">Account Name *</label><input value={bankForm.account_name} onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Bank Name</label><input value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Account Number</label><input value={bankForm.account_number} onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Branch</label><input value={bankForm.branch} onChange={(e) => setBankForm({ ...bankForm, branch: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Opening Balance</label><input type="number" step="0.01" value={bankForm.opening_balance} onChange={(e) => setBankForm({ ...bankForm, opening_balance: e.target.value })} className="input-field" /></div>
        </div>
      </FormModal>

      <FormModal open={showCashForm} title="New Cash Account" onClose={() => setShowCashForm(false)} onSubmit={handleCashCreate}>
        <div><label className="label-text mb-1">Account Name *</label><input value={cashForm.account_name} onChange={(e) => setCashForm({ ...cashForm, account_name: e.target.value })} className="input-field" placeholder="e.g., Petty Cash" /></div>
        <div><label className="label-text mb-1">Opening Balance</label><input type="number" step="0.01" value={cashForm.opening_balance} onChange={(e) => setCashForm({ ...cashForm, opening_balance: e.target.value })} className="input-field" /></div>
      </FormModal>

      <FormModal open={showManual} title="Record Manual Transaction" onClose={() => setShowManual(false)} onSubmit={handleManual} submitLabel="Record">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-text mb-1">Account Type</label>
            <select value={manualForm.account_type} onChange={(e) => setManualForm({ ...manualForm, account_type: e.target.value, account_id: '' })} className="input-field">
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div>
            <label className="label-text mb-1">Transaction Type</label>
            <select value={manualForm.transaction_type} onChange={(e) => setManualForm({ ...manualForm, transaction_type: e.target.value })} className="input-field">
              <option value="receipt">Receipt (Money In)</option>
              <option value="payment">Payment (Money Out)</option>
            </select>
          </div>
        </div>
        <select value={manualForm.account_id} onChange={(e) => setManualForm({ ...manualForm, account_id: e.target.value })} className="input-field">
          <option value="">Select {manualForm.account_type === 'cash' ? 'cash' : 'bank'} account</option>
          {accountOpts(manualForm.account_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Amount</label><input type="number" step="0.01" min="0" value={manualForm.amount} onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Date</label><input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} className="input-field" /></div>
        </div>
        <div>
          <label className="label-text mb-1">Category</label>
          <select value={manualForm.category} onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })} className="input-field">
            <option value="other">Other</option>
            <option value="owner_investment">Owner Investment</option>
            <option value="owner_withdrawal">Owner Withdrawal</option>
            <option value="interest_income">Interest Income</option>
            <option value="bank_charges">Bank Charges</option>
          </select>
        </div>
        <div><label className="label-text mb-1">Description</label><input value={manualForm.description} onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })} className="input-field" /></div>
      </FormModal>

      <FormModal open={showTransfer} title="Transfer Funds" onClose={() => setShowTransfer(false)} onSubmit={handleTransfer} submitLabel="Transfer">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-text mb-1">From Type</label>
            <select value={transferForm.from_type} onChange={(e) => setTransferForm({ ...transferForm, from_type: e.target.value, from_id: '' })} className="input-field">
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div>
            <label className="label-text mb-1">From Account</label>
            <select value={transferForm.from_id} onChange={(e) => setTransferForm({ ...transferForm, from_id: e.target.value })} className="input-field">
              <option value="">Select</option>
              {accountOpts(transferForm.from_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-text mb-1">To Type</label>
            <select value={transferForm.to_type} onChange={(e) => setTransferForm({ ...transferForm, to_type: e.target.value, to_id: '' })} className="input-field">
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label className="label-text mb-1">To Account</label>
            <select value={transferForm.to_id} onChange={(e) => setTransferForm({ ...transferForm, to_id: e.target.value })} className="input-field">
              <option value="">Select</option>
              {accountOpts(transferForm.to_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label-text mb-1">Amount</label><input type="number" step="0.01" min="0" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} className="input-field" /></div>
          <div><label className="label-text mb-1">Date</label><input type="date" value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} className="input-field" /></div>
        </div>
        <div><label className="label-text mb-1">Description</label><input value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} className="input-field" placeholder="e.g., Daily cash deposit" /></div>
      </FormModal>

      <ConfirmDialog open={!!toggling} title={toggling?.is_active ? 'Deactivate Account' : 'Activate Account'} message={`${toggling?.is_active ? 'Deactivate' : 'Activate'} "${toggling?.account_name}"?`} onConfirm={handleToggle} onCancel={() => setToggling(null)} />
    </div>
  )
}
