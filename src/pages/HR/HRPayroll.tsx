import { useEffect, useState, useCallback } from 'react'
import { Users, Calendar, DollarSign, Wallet, Plus, Pencil, Power, PowerOff, Printer, CheckCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import { formatCurrency, formatDate } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.js'
import DataTable from '../../components/DataTable.js'
import FormModal from '../../components/FormModal.js'
import ConfirmDialog from '../../components/ConfirmDialog.js'
import StatusBadge from '../../components/StatusBadge.js'
import SearchableSelect from '../../components/SearchableSelect.js'
import type { Employee, PayrollPreviewRow, EmployeeAdvanceRow } from '../../lib/types.js'

type SubTab = 'employees' | 'attendance' | 'payroll' | 'advances'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const designations = ['technician', 'helper', 'engineer', 'admin', 'accountant', 'manager', 'other']

export default function HRPayroll() {
  const { user } = useAuthStore()
  const addToast = useToastStore((s) => s.add)
  const [activeTab, setActiveTab] = useState<SubTab>('employees')

  // =============== EMPLOYEES ===============
  const [emps, setEmps] = useState<Employee[]>([])
  const [showEmpModal, setShowEmpModal] = useState(false)
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null)
  const [empForm, setEmpForm] = useState({ full_name: '', designation: 'technician', phone: '', cnic: '', address: '', joining_date: '', salary_type: 'monthly', monthly_salary: '', daily_rate: '' })
  const [toggling, setToggling] = useState<Employee | null>(null)
  const [designationFilter, setDesignationFilter] = useState('')

  // =============== ATTENDANCE ===============
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceEntries, setAttendanceEntries] = useState<Array<{ employee_id: number; status: string; overtime_hours: string }>>([])
  const [attHistory, setAttHistory] = useState<any[]>([])
  const [attSummary, setAttSummary] = useState<any>(null)
  const [attEmpId, setAttEmpId] = useState('' as string | number)
  const [attMonth, setAttMonth] = useState(String(new Date().getMonth() + 1))
  const [attYear, setAttYear] = useState(String(new Date().getFullYear()))

  // =============== PAYROLL ===============
  const [payMonth, setPayMonth] = useState(String(new Date().getMonth() + 1))
  const [payYear, setPayYear] = useState(String(new Date().getFullYear()))
  const [payrollPreview, setPayrollPreview] = useState<PayrollPreviewRow[]>([])
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [deductions, setDeductions] = useState<Record<number, string>>({})
  const [advDeducts, setAdvDeducts] = useState<Record<number, string>>({})
  const [payMethodGlobal, setPayMethodGlobal] = useState('cash')
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [showSalaryHistory, setShowSalaryHistory] = useState(false)
  const [showPayslip, setShowPayslip] = useState<any>(null)

  // =============== ADVANCES ===============
  const [advances, setAdvances] = useState<EmployeeAdvanceRow[]>([])
  const [showAdvModal, setShowAdvModal] = useState(false)
  const [advForm, setAdvForm] = useState({ employee_id: '' as string | number, date: new Date().toISOString().split('T')[0], amount: '', reason: '' })
  const [advEmpOpts, setAdvEmpOpts] = useState<Array<{ value: string | number; label: string }>>([])

  const loadEmps = useCallback(async () => {
    if (!user) return
    try {
      setEmps(await api.hr.employees.list(user.id, { designation: designationFilter || undefined }))
    } catch { addToast({ type: 'error', title: 'Error', message: 'Failed to load employees' }) }
  }, [user, designationFilter, addToast])

  useEffect(() => { loadEmps() }, [loadEmps])

  // ============== EMPLOYEE HANDLERS ==============
  const handleEmpSubmit = async () => {
    if (!user || !empForm.full_name) { addToast({ type: 'warning', title: 'Validation', message: 'Name is required' }); return }
    try {
      if (editingEmp) {
        await api.hr.employees.update(user.id, editingEmp.id, empForm)
        addToast({ type: 'success', title: 'Updated', message: 'Employee updated' })
      } else {
        const r = await api.hr.employees.create(user.id, {
          full_name: empForm.full_name, designation: empForm.designation,
          phone: empForm.phone || undefined, cnic: empForm.cnic || undefined, address: empForm.address || undefined,
          joining_date: empForm.joining_date || undefined, salary_type: empForm.salary_type,
          monthly_salary: Number(empForm.monthly_salary) || 0, daily_rate: Number(empForm.daily_rate) || 0,
        })
        addToast({ type: 'success', title: 'Created', message: `Employee ${r.employee_code} created` })
      }
      setShowEmpModal(false); loadEmps()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const handleToggle = async () => {
    if (!user || !toggling) return
    try {
      await api.hr.employees.toggleActive(user.id, toggling.id)
      addToast({ type: 'success', title: 'Updated', message: `Employee ${toggling.is_active ? 'deactivated' : 'activated'}` })
      setToggling(null); loadEmps()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  // ============== ATTENDANCE HANDLERS ==============
  const loadAttendanceForm = useCallback(async () => {
    if (!user) return
    try {
      const all = await api.hr.employees.list(user.id, { is_active: true })
      const entries = all.map((e) => {
        const existing = attendanceEntries.find((a) => a.employee_id === e.id)
        return { employee_id: e.id, status: existing?.status ?? 'present', overtime_hours: existing?.overtime_hours ?? '' }
      })
      setAttendanceEntries(entries)
    } catch { /* ignore */ }
  }, [user, attDate])

  const handleBulkAttendance = async () => {
    if (!user) return
    try {
      await api.hr.attendance.bulkMark(user.id, {
        date: attDate,
        entries: attendanceEntries.map((e) => ({ employee_id: e.employee_id, status: e.status, overtime_hours: Number(e.overtime_hours) || 0 })),
      })
      addToast({ type: 'success', title: 'Saved', message: `Attendance for ${attDate} saved` })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const loadAttHistory = useCallback(async () => {
    if (!user) return
    try {
      const [startMonth, endMonth] = attMonth ? [`${attYear}-${String(Number(attMonth)).padStart(2, '0')}-01`, `${attYear}-${String(Number(attMonth)).padStart(2, '0')}-31`] : []
      const h = await api.hr.attendance.list(user.id, {
        employee_id: attEmpId ? Number(attEmpId) : undefined,
        date_from: startMonth, date_to: endMonth,
      })
      setAttHistory(h)
    } catch { /* ignore */ }
  }, [user, attEmpId, attMonth, attYear])

  const loadAttSummary = useCallback(async () => {
    if (!user || !attEmpId) return
    try {
      const s = await api.hr.attendance.summary(user.id, { employee_id: Number(attEmpId), month: attMonth, year: Number(attYear) })
      setAttSummary(s)
    } catch { /* ignore */ }
  }, [user, attEmpId, attMonth, attYear])

  useEffect(() => { if (activeTab === 'attendance') { loadAttendanceForm(); loadAttHistory(); if (attEmpId) loadAttSummary() } }, [activeTab, loadAttendanceForm, loadAttHistory, loadAttSummary])

  // ============== PAYROLL HANDLERS ==============
  const generatePayrollPreview = async () => {
    if (!user) return
    setPayrollLoading(true)
    try {
      const preview = await api.hr.payroll.preview(user.id, { month: payMonth, year: Number(payYear) })
      setPayrollPreview(preview)
      const d: Record<number, string> = {}; const a: Record<number, string> = {}
      for (const p of preview) { d[p.employee_id] = '0'; a[p.employee_id] = String(p.pending_advances) }
      setDeductions(d); setAdvDeducts(a)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    } finally { setPayrollLoading(false) }
  }

  const processPayroll = async () => {
    if (!user) return
    try {
      for (const emp of payrollPreview) {
        if (emp.already_paid) continue
        const basicSalary = Number(emp.basic_salary)
        const otAmt = Number(emp.overtime_amount)
        const ded = Number(deductions[emp.employee_id]) || 0
        const advDed = Number(advDeducts[emp.employee_id]) || 0
        const netSalary = basicSalary + otAmt - ded - advDed
        if (netSalary <= 0) continue
        await api.hr.salary.create(user.id, {
          employee_id: emp.employee_id, month: payMonth, year: Number(payYear),
          basic_salary: basicSalary, days_present: emp.days_present_equivalent,
          overtime_amount: otAmt, deductions: ded, advance_deduction: advDed, net_salary: netSalary,
          payment_date: new Date().toISOString().split('T')[0], paid_via: payMethodGlobal,
        })
      }
      addToast({ type: 'success', title: 'Payroll Processed', message: 'Salaries processed successfully' })
      generatePayrollPreview()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const loadSalaryHistory = useCallback(async () => {
    if (!user) return
    try {
      setSalaryHistory(await api.hr.salary.list(user.id, { month: payMonth, year: Number(payYear) }))
    } catch { /* ignore */ }
  }, [user, payMonth, payYear])

  useEffect(() => { if (activeTab === 'payroll') loadSalaryHistory() }, [activeTab, loadSalaryHistory])

  const printPayslip = (row: any) => {
    const win = window.open('', '_blank', 'width=600,height=700')
    if (!win) { alert('Allow pop-ups'); return }
    win.document.write(`<!DOCTYPE html><html><head><title>Payslip</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:6px}.border{border:1px solid #000;padding:10px}.right{text-align:right}.center{text-align:center}h2{margin:0}.header{text-align:center;margin-bottom:20px}</style></head><body>
<div class="header"><h2>PAYSLIP</h2><p>${row.employee_name} | ${months[Number(row.month)-1]} ${row.year}</p></div>
<div class="border"><table><tr><td>Employee:</td><td><strong>${row.employee_name}</strong></td><td>Designation:</td><td><strong>${row.designation}</strong></td></tr></table></div><br/>
<table><tr><td>Basic Salary:</td><td class="right">${formatCurrency(row.basic_salary)}</td></tr>
<tr><td>Overtime:</td><td class="right">${formatCurrency(row.overtime_amount)}</td></tr>
<tr><td>Deductions:</td><td class="right">-${formatCurrency(row.deductions)}</td></tr>
<tr><td>Advance Deduction:</td><td class="right">-${formatCurrency(row.advance_deduction)}</td></tr>
<tr style="font-weight:bold;border-top:2px solid #000"><td>Net Salary:</td><td class="right">${formatCurrency(row.net_salary)}</td></tr></table>
<div style="margin-top:60px;display:flex;justify-content:space-between"><div style="border-top:1px solid #000;padding-top:8px;width:180px;text-align:center">Employee Signature</div><div style="border-top:1px solid #000;padding-top:8px;width:180px;text-align:center">Authorized Signatory</div></div></body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  // ============== ADVANCES HANDLERS ==============
  const loadAdvances = useCallback(async () => {
    if (!user) return
    try {
      setAdvances(await api.hr.advances.list(user.id))
    } catch { /* ignore */ }
  }, [user])

  useEffect(() => { if (activeTab === 'advances') { loadAdvances(); loadEmps() } }, [activeTab, loadAdvances, loadEmps])

  const handleAdvSubmit = async () => {
    if (!user) return
    if (!advForm.employee_id || !advForm.amount) { addToast({ type: 'warning', title: 'Validation', message: 'Employee and amount are required' }); return }
    try {
      await api.hr.advances.give(user.id, {
        employee_id: Number(advForm.employee_id), date: advForm.date, amount: Number(advForm.amount),
        reason: advForm.reason || undefined,
      })
      addToast({ type: 'success', title: 'Advance Given', message: 'Advance recorded' })
      setShowAdvModal(false); loadAdvances()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  // Employee dropdown for advances
  useEffect(() => {
    if (emps.length > 0) {
      setAdvEmpOpts(emps.filter((e) => e.is_active).map((e) => ({ value: e.id, label: `${e.employee_code ?? ''} - ${e.full_name}` })))
    }
  }, [emps])

  return (
    <div>
      <PageHeader title="HR & Payroll" subtitle="Employees, attendance, and payroll management" />

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'employees' as SubTab, label: 'Employees', icon: Users },
            { id: 'attendance' as SubTab, label: 'Attendance', icon: Calendar },
            { id: 'payroll' as SubTab, label: 'Payroll', icon: DollarSign },
            { id: 'advances' as SubTab, label: 'Advances', icon: Wallet },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${activeTab === tab.id ? 'border-navy-800 text-navy-800' : 'border-transparent text-gray-500'}`}>
                <Icon size={18} /> {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-6">
        {/* =========== EMPLOYEES TAB =========== */}
        {activeTab === 'employees' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <select value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)} className="input-field w-40 text-sm">
                <option value="">All Designations</option>
                {designations.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={() => { setEditingEmp(null); setEmpForm({ full_name: '', designation: 'technician', phone: '', cnic: '', address: '', joining_date: '', salary_type: 'monthly', monthly_salary: '', daily_rate: '' }); setShowEmpModal(true) }} className="btn-primary gap-2"><Plus size={16} /> Add Employee</button>
            </div>
            <DataTable
              data={emps}
              columns={[
                { key: 'employee_code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.employee_code ?? '-'}</span> },
                { key: 'full_name', header: 'Name' },
                { key: 'designation', header: 'Designation', render: (r) => <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{r.designation}</span> },
                { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '-' },
                { key: 'salary_type', header: 'Salary', render: (r) => r.salary_type === 'monthly' ? `Rs.${r.monthly_salary}/mo` : `Rs.${r.daily_rate}/day` },
                { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'Active' : 'Inactive'} /> },
                { key: 'id', header: 'Actions', render: (r) => (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditingEmp(r); setEmpForm({ full_name: r.full_name, designation: r.designation, phone: r.phone ?? '', cnic: r.cnic ?? '', address: r.address ?? '', joining_date: r.joining_date ?? '', salary_type: r.salary_type, monthly_salary: String(r.monthly_salary || ''), daily_rate: String(r.daily_rate || '') }); setShowEmpModal(true) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                    <button onClick={() => setToggling(r)} className="rounded p-1 text-gray-400 hover:text-gray-600">{r.is_active ? <PowerOff size={14} /> : <Power size={14} />}</button>
                  </div>
                )},
              ]}
            />
            <FormModal open={showEmpModal} title={editingEmp ? 'Edit Employee' : 'Add Employee'} onClose={() => setShowEmpModal(false)} onSubmit={handleEmpSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><label className="label-text mb-1">Full Name *</label><input value={empForm.full_name} onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Designation</label><select value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} className="input-field">{designations.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
                <div><label className="label-text mb-1">Salary Type</label><select value={empForm.salary_type} onChange={(e) => setEmpForm({ ...empForm, salary_type: e.target.value })} className="input-field"><option value="monthly">Monthly</option><option value="daily_wage">Daily Wage</option></select></div>
                {empForm.salary_type === 'monthly' ? (
                  <div><label className="label-text mb-1">Monthly Salary</label><input type="number" step="0.01" min="0" value={empForm.monthly_salary} onChange={(e) => setEmpForm({ ...empForm, monthly_salary: e.target.value })} className="input-field" /></div>
                ) : (
                  <div><label className="label-text mb-1">Daily Rate</label><input type="number" step="0.01" min="0" value={empForm.daily_rate} onChange={(e) => setEmpForm({ ...empForm, daily_rate: e.target.value })} className="input-field" /></div>
                )}
                <div><label className="label-text mb-1">Phone</label><input value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">CNIC</label><input value={empForm.cnic} onChange={(e) => setEmpForm({ ...empForm, cnic: e.target.value })} className="input-field" /></div>
                <div className="md:col-span-2"><label className="label-text mb-1">Address</label><input value={empForm.address} onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Joining Date</label><input type="date" value={empForm.joining_date} onChange={(e) => setEmpForm({ ...empForm, joining_date: e.target.value })} className="input-field" /></div>
              </div>
            </FormModal>
            <ConfirmDialog open={!!toggling} title={toggling?.is_active ? 'Deactivate Employee' : 'Activate Employee'} message={`${toggling?.is_active ? 'Deactivate' : 'Activate'} ${toggling?.full_name}?`} onConfirm={handleToggle} onCancel={() => setToggling(null)} />
          </div>
        )}

        {/* =========== ATTENDANCE TAB =========== */}
        {activeTab === 'attendance' && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="card p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Quick Mark Attendance</h4>
                <div className="mb-3"><input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="input-field" /></div>
                <div className="max-h-[500px] overflow-y-auto space-y-1">
                  {attendanceEntries.map((entry) => {
                    const emp = emps.find((e) => e.id === entry.employee_id)
                    return (
                      <div key={entry.employee_id} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-2 py-1">
                        <span className="w-36 truncate">{emp?.full_name ?? ''}</span>
                        <select value={entry.status} onChange={(e) => setAttendanceEntries(attendanceEntries.map((a) => a.employee_id === entry.employee_id ? { ...a, status: e.target.value } : a))} className="input-field text-xs w-24">
                          <option value="present" style={{ color: 'green' }}>Present</option>
                          <option value="absent" style={{ color: 'red' }}>Absent</option>
                          <option value="half_day" style={{ color: '#d97706' }}>Half Day</option>
                          <option value="leave" style={{ color: 'blue' }}>Leave</option>
                          <option value="holiday" style={{ color: '#6b7280' }}>Holiday</option>
                        </select>
                        <input type="number" step="0.5" min="0" value={entry.overtime_hours} onChange={(e) => setAttendanceEntries(attendanceEntries.map((a) => a.employee_id === entry.employee_id ? { ...a, overtime_hours: e.target.value } : a))} className="input-field text-xs w-16" placeholder="OT" />
                      </div>
                    )
                  })}
                </div>
                <button onClick={handleBulkAttendance} className="btn-primary mt-3 w-full"><CheckCircle size={16} /> Save Attendance</button>
              </div>
            </div>
            <div>
              <div className="card p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Attendance History</h4>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <select value={attEmpId} onChange={(e) => setAttEmpId(e.target.value)} className="input-field text-xs">
                    <option value="">All Employees</option>
                    {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                  <select value={attMonth} onChange={(e) => setAttMonth(e.target.value)} className="input-field text-xs">
                    {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <input type="number" value={attYear} onChange={(e) => setAttYear(e.target.value)} className="input-field text-xs" />
                </div>

                {attSummary && (
                  <div className="grid grid-cols-5 gap-1 text-xs mb-3">
                    <div className="bg-green-50 text-green-700 rounded p-1 text-center"><strong>P</strong> {attSummary.present}</div>
                    <div className="bg-red-50 text-red-700 rounded p-1 text-center"><strong>A</strong> {attSummary.absent}</div>
                    <div className="bg-yellow-50 text-yellow-700 rounded p-1 text-center"><strong>HD</strong> {attSummary.half_day}</div>
                    <div className="bg-blue-50 text-blue-700 rounded p-1 text-center"><strong>L</strong> {attSummary.leave}</div>
                    <div className="bg-gray-50 text-gray-600 rounded p-1 text-center"><strong>OT</strong> {attSummary.total_overtime_hours}h</div>
                  </div>
                )}

                <div className="max-h-[400px] overflow-y-auto">
                  {attHistory.map((a) => {
                    const colors: Record<string, string> = { present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', half_day: 'bg-yellow-100 text-yellow-700', leave: 'bg-blue-100 text-blue-700', holiday: 'bg-gray-100 text-gray-500' }
                    return (
                      <div key={a.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50">
                        <span className="w-32 truncate">{a.employee_name}</span>
                        <span className="w-20">{formatDate(a.date)}</span>
                        <span className={`rounded-full px-2 py-0.5 ${colors[a.status] ?? ''}`}>{a.status.replace('_', ' ')}</span>
                        {a.overtime_hours > 0 && <span className="text-orange-600">OT: {a.overtime_hours}h</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========== PAYROLL TAB =========== */}
        {activeTab === 'payroll' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <select value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className="input-field w-36 text-sm">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={payYear} onChange={(e) => setPayYear(e.target.value)} className="input-field w-24 text-sm" />
              <button onClick={generatePayrollPreview} className="btn-primary" disabled={payrollLoading}>{payrollLoading ? 'Loading...' : 'Generate Payroll Preview'}</button>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-gray-500">Pay Method:</span>
                <select value={payMethodGlobal} onChange={(e) => setPayMethodGlobal(e.target.value)} className="input-field text-xs w-20">
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <button onClick={() => setShowSalaryHistory(!showSalaryHistory)} className="btn-secondary text-sm ml-auto">{showSalaryHistory ? 'Show Payroll' : 'Salary History'}</button>
            </div>

            {showSalaryHistory ? (
              <DataTable
                data={salaryHistory}
                columns={[
                  { key: 'employee_name', header: 'Employee' },
                  { key: 'basic_salary', header: 'Basic', render: (r) => formatCurrency(r.basic_salary) },
                  { key: 'overtime_amount', header: 'OT', render: (r) => formatCurrency(r.overtime_amount) },
                  { key: 'deductions', header: 'Deductions', render: (r) => formatCurrency(r.deductions) },
                  { key: 'advance_deduction', header: 'Adv Ded', render: (r) => formatCurrency(r.advance_deduction) },
                  { key: 'net_salary', header: 'Net', render: (r) => <span className="font-bold">{formatCurrency(r.net_salary)}</span> },
                  { key: 'payment_date', header: 'Paid On', render: (r) => r.payment_date ? formatDate(r.payment_date) : '-' },
                  { key: 'id', header: '', render: (r) => <button onClick={(e) => { e.stopPropagation(); printPayslip(r) }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Printer size={14} /></button> },
                ]}
              />
            ) : (
              <div>
                {payrollPreview.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-2 pr-3">Employee</th><th className="py-2 pr-3">Designation</th><th className="py-2 pr-3">Days</th><th className="py-2 pr-3">Basic</th><th className="py-2 pr-3">OT</th><th className="py-2 pr-3">Deductions</th><th className="py-2 pr-3">Adv Ded.</th><th className="py-2 pr-3">Net Salary</th><th className="py-2">Status</th></tr></thead>
                      <tbody>
                        {payrollPreview.map((emp) => {
                          const ded = Number(deductions[emp.employee_id]) || 0
                          const advDed = Number(advDeducts[emp.employee_id]) || 0
                          const net = emp.basic_salary + emp.overtime_amount - ded - advDed
                          return (
                            <tr key={emp.employee_id} className="border-b border-gray-50">
                              <td className="py-2 pr-3 font-medium">{emp.employee_name}</td>
                              <td className="py-2 pr-3 text-xs text-gray-500">{emp.designation}</td>
                              <td className="py-2 pr-3">{emp.days_present_equivalent}/{emp.salary_type === 'monthly' ? '30' : emp.days_present_equivalent}</td>
                              <td className="py-2 pr-3">{formatCurrency(emp.basic_salary)}</td>
                              <td className="py-2 pr-3">{formatCurrency(emp.overtime_amount)}</td>
                              <td className="py-2 pr-3"><input type="number" step="0.01" min="0" value={deductions[emp.employee_id] || '0'} onChange={(e) => setDeductions({ ...deductions, [emp.employee_id]: e.target.value })} className="input-field text-xs w-20" /></td>
                              <td className="py-2 pr-3"><input type="number" step="0.01" min="0" value={advDeducts[emp.employee_id] || '0'} onChange={(e) => setAdvDeducts({ ...advDeducts, [emp.employee_id]: e.target.value })} className="input-field text-xs w-20" /></td>
                              <td className="py-2 pr-3 font-bold">{formatCurrency(net)}</td>
                              <td className="py-2">{emp.already_paid ? <StatusBadge status="Paid" /> : <span className="text-xs text-blue-600">Pending</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {payrollPreview.filter((e) => !e.already_paid).length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <button onClick={processPayroll} className="btn-primary gap-2"><CheckCircle size={16} /> Process Payroll ({payrollPreview.filter((e) => !e.already_paid).length} employees)</button>
                  </div>
                )}
                {payrollPreview.length === 0 && !payrollLoading && (
                  <p className="text-sm text-gray-400 text-center py-8">Click "Generate Payroll Preview" to see salary calculations.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========== ADVANCES TAB =========== */}
        {activeTab === 'advances' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">{advances.length} advance(s)</span>
              <button onClick={() => setShowAdvModal(true)} className="btn-primary gap-2"><Plus size={16} /> Give Advance</button>
            </div>
            <DataTable
              data={advances}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'employee_name', header: 'Employee' },
                { key: 'employee_code', header: 'Code', render: (r) => r.employee_code ?? '-' },
                { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span> },
                { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '-' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
            <FormModal open={showAdvModal} title="Give Employee Advance" onClose={() => setShowAdvModal(false)} onSubmit={handleAdvSubmit} submitLabel="Give Advance">
              <SearchableSelect label="Employee" options={advEmpOpts} value={advForm.employee_id} onChange={(v) => setAdvForm({ ...advForm, employee_id: v })} placeholder="Select employee" />
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-text mb-1">Amount</label><input type="number" step="0.01" min="0" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} className="input-field" /></div>
                <div><label className="label-text mb-1">Date</label><input type="date" value={advForm.date} onChange={(e) => setAdvForm({ ...advForm, date: e.target.value })} className="input-field" /></div>
              </div>
              <div><label className="label-text mb-1">Reason</label><input value={advForm.reason} onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })} className="input-field" placeholder="e.g., Tool advance" /></div>
            </FormModal>
          </div>
        )}
      </div>
    </div>
  )
}
