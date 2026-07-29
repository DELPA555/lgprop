import { Construction } from 'lucide-react'
import PageHeader from './PageHeader'

export default function Placeholder({ title }: { title: string }): JSX.Element {
  return (
    <div className="p-6">
      <PageHeader title={title} subtitle="Módulo en construcción" />
      <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
        <Construction className="text-zinc-600" size={36} />
        <p className="text-sm text-zinc-400">
          Este módulo todavía no está implementado.
        </p>
        <p className="text-xs text-zinc-600">
          La base de datos y la conexión ya están listas — lo desarrollamos en el próximo paso.
        </p>
      </div>
    </div>
  )
}
