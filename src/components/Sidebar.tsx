import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Truck,
  Users,
  Package,
  Boxes,
  ShoppingCart,
  Factory,
  ArrowLeftRight,
  FolderKanban,
  FileText,
  Receipt,
  UserCircle,
  Landmark,
  BookOpen,
  BarChart3,
  Settings,
} from 'lucide-react'
import { useAuthStore, hasAccess, type UserRole } from '../store/authStore.js'

const allNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, route: 'dashboard' },
  { to: '/vendors', label: 'Vendors', icon: Truck, route: 'vendors' },
  { to: '/customers', label: 'Customers', icon: Users, route: 'customers' },
  { to: '/raw-materials', label: 'Raw Materials', icon: Package, route: 'raw-materials' },
  { to: '/finished-goods', label: 'Finished Goods', icon: Boxes, route: 'finished-goods' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart, route: 'purchases' },
  { to: '/fabrication', label: 'Fabrication', icon: Factory, route: 'fabrication' },
  { to: '/stock-movements', label: 'Stock Movements', icon: ArrowLeftRight, route: 'stock-movements' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, route: 'projects' },
  { to: '/invoices', label: 'Invoices', icon: FileText, route: 'invoices' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, route: 'expenses' },
  { to: '/hr-payroll', label: 'HR & Payroll', icon: UserCircle, route: 'hr-payroll' },
  { to: '/cash-bank', label: 'Cash & Bank', icon: Landmark, route: 'cash-bank' },
  { to: '/accounting', label: 'Accounting', icon: BookOpen, route: 'accounting' },
  { to: '/reports', label: 'Reports', icon: BarChart3, route: 'reports' },
  { to: '/settings', label: 'Settings', icon: Settings, route: 'settings' },
]

export default function Sidebar() {
  const { user } = useAuthStore()
  const role = (user?.role ?? 'viewer') as UserRole

  const navItems = allNavItems.filter((item) => hasAccess(role, item.route))

  return (
    <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col bg-navy-900 text-white">
      <div className="flex h-16 shrink-0 items-center border-b border-navy-800 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white text-navy-900">
            <Factory size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight">HVAC ERP</span>
        </div>
      </div>
      <nav className="scrollbar-sidebar flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="shrink-0 border-t border-navy-800 p-4 text-xs text-gray-400">
        Offline Desktop ERP
      </div>
    </aside>
  )
}
