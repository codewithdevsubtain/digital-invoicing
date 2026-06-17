interface PrintPreviewProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  onPrint?: () => void
}

export default function PrintPreview({ title, children, onClose, onPrint }: PrintPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex gap-3">
            {onPrint && (
              <button onClick={onPrint} className="btn-primary">
                Print
              </button>
            )}
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </div>
    </div>
  )
}
