import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore, hasAccess, routeKeyFromPath } from './store/authStore.js'
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
import ProjectDetail from './pages/Projects/ProjectDetail.js'
import Invoices from './pages/Invoices/Invoices.js'
import Expenses from './pages/Expenses/Expenses.js'
import HRPayroll from './pages/HR/HRPayroll.js'
import CashBank from './pages/Accounting/CashBank.js'
import Accounting from './pages/Accounting/Accounting.js'
import Reports from './pages/Reports/Reports.js'
import Settings from './pages/Settings/Settings.js'
import Loading from './components/Loading.js'

function RoleGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const location = useLocation()
  const routeKey = routeKeyFromPath(location.pathname)

  if (!user) return <Navigate to="/login" replace />
  if (!hasAccess(user.role, routeKey)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function ProtectedLayout() {
  const { user, sessionChecked, forcePasswordChange } = useAuthStore()

  if (!sessionChecked) {
    return <Loading fullScreen text="Loading session..." />
  }

  if (!user || forcePasswordChange) {
    return <Navigate to="/login" replace />
  }

  return <Layout />
}

function AuthGate() {
  const { user, sessionChecked, forcePasswordChange } = useAuthStore()

  if (!sessionChecked) {
    return <Loading fullScreen text="Loading session..." />
  }

  if (user && !forcePasswordChange) {
    return <Navigate to="/" replace />
  }

  return <Login />
}

function App() {
  const loadSession = useAuthStore((s) => s.loadSession)

  useEffect(() => {
    loadSession()
  }, [loadSession])

  return (
    <Routes>
      <Route path="/login" element={<AuthGate />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<RoleGuard><Dashboard /></RoleGuard>} />
        <Route path="vendors" element={<RoleGuard><Vendors /></RoleGuard>} />
        <Route path="vendors/:id/ledger" element={<RoleGuard><VendorLedger /></RoleGuard>} />
        <Route path="customers" element={<RoleGuard><Customers /></RoleGuard>} />
        <Route path="customers/:id" element={<RoleGuard><CustomerDetail /></RoleGuard>} />
        <Route path="customers/:id/ledger" element={<RoleGuard><CustomerLedger /></RoleGuard>} />
        <Route path="raw-materials" element={<RoleGuard><RawMaterials /></RoleGuard>} />
        <Route path="finished-goods" element={<RoleGuard><FinishedGoods /></RoleGuard>} />
        <Route path="purchases" element={<RoleGuard><Purchases /></RoleGuard>} />
        <Route path="fabrication" element={<RoleGuard><Fabrication /></RoleGuard>} />
        <Route path="stock-movements" element={<RoleGuard><StockMovements /></RoleGuard>} />
        <Route path="projects" element={<RoleGuard><Projects /></RoleGuard>} />
        <Route path="projects/:id" element={<RoleGuard><ProjectDetail /></RoleGuard>} />
        <Route path="invoices" element={<RoleGuard><Invoices /></RoleGuard>} />
        <Route path="expenses" element={<RoleGuard><Expenses /></RoleGuard>} />
        <Route path="hr-payroll" element={<RoleGuard><HRPayroll /></RoleGuard>} />
        <Route path="cash-bank" element={<RoleGuard><CashBank /></RoleGuard>} />
        <Route path="accounting" element={<RoleGuard><Accounting /></RoleGuard>} />
        <Route path="reports" element={<RoleGuard><Reports /></RoleGuard>} />
        <Route path="settings" element={<RoleGuard><Settings /></RoleGuard>} />
      </Route>
    </Routes>
  )
}

export default App
