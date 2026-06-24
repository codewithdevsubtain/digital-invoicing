import { useState } from 'react'
import { ScrollText, Settings2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader.js'
import BOMTab from './BOMTab.js'
import FabOrdersTab from './FabOrdersTab.js'

type SubTab = 'boms' | 'orders'

const tabs = [
  { id: 'orders' as SubTab, label: 'Fabrication Orders', icon: Settings2 },
  { id: 'boms' as SubTab, label: 'BOMs / Recipes', icon: ScrollText },
]

export default function Fabrication() {
  const [activeTab, setActiveTab] = useState<SubTab>('orders')

  return (
    <div>
      <PageHeader title="Fabrication" subtitle="BOM recipes and fabrication order management" />

      <div className="mt-6 border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-6 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${activeTab === tab.id
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
        {activeTab === 'boms' && <BOMTab />}
        {activeTab === 'orders' && <FabOrdersTab />}
      </div>
    </div>
  )
}
