import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore.js'
import Layout from './components/Layout.js'
import Login from './pages/Login/Login.js'
import Dashboard from './pages/Dashboard/Dashboard.js'
import Vendors from './pages/Vendors/Vendors.js'
import VendorLedger from './pages/Vendors/VendorLedger.js'
import Customers from './pages/Customers/Customers.js'
import CustomerLedger from './pages/Customers/CustomerLedger.js'
import CustomerDetail from './pages/Customers/CustomerDetail.js'
import RawMaterials from './pages/Inventory/RawMaterials.js'
import FinishedGoods from './pages/Inventory/FinishedGoods.js'
import Purchases from './pages/Purchases/Purchases.js'
import Fabrication from './pages/Fabrication/Fabrication.js'
import StockMovements from './pages/Inventory/StockMovements.js'
import Projects from './pages/Projects/Projects.js'
import Invoices from './pages/Invoices/Invoices.js'
import Expenses from './pages/Expenses/Expenses.js'
import HRPayroll from './pages/HR/HRPayroll.js'
import CashBank from './pages/Accounting/CashBank.js'
import Accounting from './pages/Accounting/Accounting.js'
import Reports from './pages/Reports/Reports.js'
import Settings from './pages/Settings/Settings.js'

function ProtectedLayout() {
  const { user, loading, forcePasswordChange, loadSession } = useAuthStore()

  useEffect(() => {
    loadSession()
  }, [loadSession])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Loading session...</p>
      </div>
    )
  }

  if (!user || forcePasswordChange) {
    return <Navigate to="/login" replace />
  }

  return <Layout />
}

function AuthGate() {
  const { user, loading, forcePasswordChange } = useAuthStore()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Loading session...</p>
      </div>
    )
  }

  if (user && !forcePasswordChange) {
    return <Navigate to="/" replace />
  }

  return <Login />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthGate />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="vendors/:id/ledger" element={<VendorLedger />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/ledger" element={<CustomerLedger />} />
        <Route path="raw-materials" element={<RawMaterials />} />
        <Route path="finished-goods" element={<FinishedGoods />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="fabrication" element={<Fabrication />} />
        <Route path="stock-movements" element={<StockMovements />} />
        <Route path="projects" element={<Projects />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="hr-payroll" element={<HRPayroll />} />
        <Route path="cash-bank" element={<CashBank />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
