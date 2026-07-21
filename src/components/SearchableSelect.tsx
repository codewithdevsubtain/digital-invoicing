import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'

interface Option {
  value: string | number
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value?: string | number
  onChange: (value: string | number) => void
  placeholder?: string
  label?: string
  className?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => String(o.value) === String(value))
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && <label className="label-text mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-field flex items-center justify-between text-left text-sm py-2 w-full"
      >
        <span className={`truncate ${selected && value !== '' ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {selected && value !== '' ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-gray-400 ml-1" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-full w-max max-w-sm rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search size={16} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm outline-none"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1">
            {filtered.map((option) => (
              <li
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  setQuery('')
                }}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${
                  String(option.value) === String(value) ? 'bg-navy-50 text-navy-800 font-semibold' : 'text-gray-700'
                }`}
              >
                {option.label}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">No options found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
