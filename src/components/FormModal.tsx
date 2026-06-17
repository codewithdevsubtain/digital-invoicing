import { X } from 'lucide-react'
import { useEffect } from 'react'

interface FormModalProps {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
}

export default function FormModal({
  open,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
}: FormModalProps) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {onSubmit && (
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={onSubmit} className="btn-primary">
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
