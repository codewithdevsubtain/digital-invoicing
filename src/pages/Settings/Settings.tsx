import { useEffect, useRef, useState } from 'react'
import { Save, Upload, Building2, Users, ScrollText } from 'lucide-react'
import PageHeader from '../../components/PageHeader.js'
import Loading from '../../components/Loading.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToastStore } from '../../store/toastStore.js'
import UsersTab from './UsersTab.js'
import ActivityLogTab from './ActivityLogTab.js'

const months = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const tabs = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users, adminOnly: true },
  { id: 'activity', label: 'Activity Log', icon: ScrollText, adminOnly: true },
]

export default function Settings() {
  const { user } = useAuthStore()
  const { settings, loading, saving, loadSettings, saveSettings, uploadLogo } = useSettingsStore()
  const addToast = useToastStore((s) => s.add)
  const [activeTab, setActiveTab] = useState('company')
  const [form, setForm] = useState(settings)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    setForm(settings)
  }, [settings])

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Logo too large', message: 'Please select an image under 2 MB.' })
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      try {
        await uploadLogo(base64)
        addToast({ type: 'success', title: 'Logo uploaded', message: 'Company logo saved successfully.' })
      } catch (err) {
        addToast({ type: 'error', title: 'Upload failed', message: 'Could not save company logo.' })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await saveSettings(form)
      addToast({ type: 'success', title: 'Settings saved', message: 'Company information has been updated.' })
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: 'Could not save settings.' })
    }
  }

  if (loading) {
    return <Loading text="Loading settings..." />
  }

  const visibleTabs = tabs.filter((t) => !t.adminOnly || user?.role === 'admin')

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company information, users, and audit log" />

      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {visibleTabs.map((tab) => {
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
        {activeTab === 'company' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="card">
              <h3 className="mb-6 text-lg font-semibold text-gray-900">Company Profile</h3>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label-text mb-1">Company Name</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => update('company_name', e.target.value)}
                    className="input-field"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label-text mb-1">Address</label>
                  <textarea
                    value={form.company_address}
                    onChange={(e) => update('company_address', e.target.value)}
                    rows={3}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.company_phone}
                    onChange={(e) => update('company_phone', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">Email</label>
                  <input
                    type="email"
                    value={form.company_email}
                    onChange={(e) => update('company_email', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">NTN Number</label>
                  <input
                    type="text"
                    value={form.company_ntn}
                    onChange={(e) => update('company_ntn', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">STRN Number</label>
                  <input
                    type="text"
                    value={form.company_strn}
                    onChange={(e) => update('company_strn', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label-text mb-1">Company Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                      {form.company_logo ? (
                        <img
                          src={form.company_logo}
                          alt="Company logo"
                          className="h-full w-full rounded-lg object-contain"
                        />
                      ) : (
                        <Building2 className="text-gray-300" size={32} />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary gap-2"
                    >
                      <Upload size={16} />
                      Upload Logo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Recommended: square PNG/JPG under 2 MB.</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-6 text-lg font-semibold text-gray-900">Financial Defaults</h3>
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <label className="label-text mb-1">Default GST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.default_gst_percent}
                    onChange={(e) => update('default_gst_percent', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">Default WHT (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.default_wht_percent}
                    onChange={(e) => update('default_wht_percent', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    value={form.currency_symbol}
                    onChange={(e) => update('currency_symbol', e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="label-text mb-1">Financial Year Start Month</label>
                  <select
                    value={form.financial_year_start_month}
                    onChange={(e) => update('financial_year_start_month', e.target.value)}
                    className="input-field"
                  >
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="btn-primary gap-2">
                {saving ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'activity' && <ActivityLogTab />}
      </div>
    </div>
  )
}
