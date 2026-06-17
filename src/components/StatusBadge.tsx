const styles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-gray-200',
  pending: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  in_progress: 'bg-blue-50 text-blue-700 ring-blue-200',
  active: 'bg-green-50 text-green-700 ring-green-200',
  completed: 'bg-green-50 text-green-700 ring-green-200',
  paid: 'bg-green-50 text-green-700 ring-green-200',
  sent: 'bg-blue-50 text-blue-700 ring-blue-200',
  overdue: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-gray-100 text-gray-500 ring-gray-200',
  resigned: 'bg-gray-100 text-gray-500 ring-gray-200',
  terminated: 'bg-red-50 text-red-700 ring-red-200',
}

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/\s+/g, '_')
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
        styles[key] ?? 'bg-gray-50 text-gray-700 ring-gray-200'
      }`}
    >
      {status}
    </span>
  )
}
