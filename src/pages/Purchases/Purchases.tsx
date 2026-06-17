import { useState } from 'react'
import { ShoppingCart, FileText, DollarSign } from 'lucide-react'
import PageHeader from '../../components/PageHeader.js'
import PurchaseOrdersTab from './PurchaseOrdersTab.js'
import PurchaseInvoicesTab from './PurchaseInvoicesTab.js'
import PaymentsTab from './PaymentsTab.js'

type SubTab = 'po' | 'invoices' | 'payments'

const tabs = [
  { id: 'invoices' as SubTab, label: 'Purchase Invoices', icon: FileText },
  { id: 'po' as SubTab, label: 'Purchase Orders', icon: ShoppingCart },
  { id: 'payments' as SubTab, label: 'Vendor Payments', icon: DollarSign },
]

export default function Purchases() {
  const [activeTab, setActiveTab] = useState<SubTab>('invoices')

  return (
    <div>
      <PageHeader title="Purchases" subtitle="Manage purchase invoices, orders, and vendor payments" />

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'border-navy-800 text-navy-800'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'po' && <PurchaseOrdersTab />}
        {activeTab === 'invoices' && <PurchaseInvoicesTab />}
        {activeTab === 'payments' && <PaymentsTab />}
      </div>
    </div>
  )
}
