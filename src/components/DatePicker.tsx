interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  id?: string
}

export default function DatePicker({ value, onChange, label, id }: DatePickerProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label-text mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field"
      />
    </div>
  )
}
