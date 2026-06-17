import { Loader2 } from 'lucide-react'

interface LoadingProps {
  fullScreen?: boolean
  text?: string
}

export default function Loading({ fullScreen = false, text = 'Loading...' }: LoadingProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3 text-navy-800">
      <Loader2 size={32} className="animate-spin" />
      <span className="text-sm font-medium text-gray-600">{text}</span>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
        {content}
      </div>
    )
  }

  return <div className="flex h-48 items-center justify-center">{content}</div>
}
