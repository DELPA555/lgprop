import { DatabaseZap } from 'lucide-react'

export default function ConfigNotice(): JSX.Element {
  return (
    <div className="card p-4 mb-5 flex items-start gap-3 border-amber-500/30">
      <DatabaseZap className="text-amber-400 shrink-0 mt-0.5" size={18} />
      <div>
        <p className="text-sm text-amber-300 font-medium">Supabase no configurado</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          Completá <code className="text-zinc-300">.env</code> con las credenciales de Supabase y
          reiniciá <code className="text-zinc-300">npm run dev</code> para usar este módulo.
        </p>
      </div>
    </div>
  )
}
