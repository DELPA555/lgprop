import { ReactNode } from 'react'

export default function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
