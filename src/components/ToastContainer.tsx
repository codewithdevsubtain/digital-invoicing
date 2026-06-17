import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../store/toastStore.js'

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const styles = {
  success: 'bg-green-50 text-green-800 ring-green-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
  warning: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex w-80 items-start gap-3 rounded-lg p-4 shadow-lg ring-1 ${styles[toast.type]}`}
          >
            <Icon size={20} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              {toast.title && <p className="font-medium">{toast.title}</p>}
              <p className="text-sm opacity-90">{toast.message}</p>
            </div>
            <button
              onClick={() => remove(toast.id)}
              className="shrink-0 rounded p-1 hover:bg-black/5"
            >
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
