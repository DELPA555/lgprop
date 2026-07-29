import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'

export function Field({
  label,
  required,
  children
}: {
  label: string
  required?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={`input w-full ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea {...props} className={`input w-full min-h-[72px] resize-y ${props.className ?? ''}`} />
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
): JSX.Element {
  return (
    <select {...props} className={`input w-full ${props.className ?? ''}`}>
      {props.children}
    </select>
  )
}
