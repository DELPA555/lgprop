import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { LogActividad, UsuarioEquipo } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

const ACCIONES: { id: string; label: string }[] = [
  { id: '', label: 'Todas las acciones' },
  { id: 'cobrar', label: 'Cobro de pago' },
  { id: 'editar', label: 'Edición' },
  { id: 'eliminar', label: 'Eliminación' },
  { id: 'enviar', label: 'Liquidación enviada' }
]

const TABLA_LABEL: Record<string, string> = {
  pagos: 'Pago',
  contratos: 'Contrato',
  duenos: 'Dueño',
  propiedades: 'Propiedad',
  liquidaciones: 'Liquidación'
}

const ACCION_BADGE: Record<string, string> = {
  cobrar: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  editar: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  eliminar: 'bg-red-500/10 text-red-400 border-red-500/20',
  enviar: 'bg-violet-500/10 text-violet-400 border-violet-500/20'
}

function fechaHora(iso: string): string {
  try {
    const d = new Date(iso)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch {
    return iso
  }
}

function detalleTexto(d: Record<string, unknown> | null): string {
  if (!d) return '—'
  return Object.entries(d)
    .map(([k, v]) => {
      if (v && typeof v === 'object' && 'antes' in (v as object)) {
        const o = v as { antes: unknown; despues: unknown }
        return `${k}: ${o.antes ?? '∅'} → ${o.despues ?? '∅'}`
      }
      return `${k}: ${v ?? '∅'}`
    })
    .join('  ·  ')
}

export default function Actividad(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<LogActividad[]>([])
  const [users, setUsers] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [fUsuario, setFUsuario] = useState('')
  const [fAccion, setFAccion] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase
      .from('usuarios_equipo')
      .select('*')
      .order('nombre')
      .then(({ data }) => setUsers(data ?? []))
  }, [])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    let q = supabase
      .from('log_actividad')
      .select('*')
      .order('fecha_hora', { ascending: false })
      .limit(500)
    if (fUsuario) q = q.eq('usuario_id', fUsuario)
    if (fAccion) q = q.eq('accion', fAccion)
    if (fDesde) q = q.gte('fecha_hora', `${fDesde}T00:00:00`)
    if (fHasta) q = q.lte('fecha_hora', `${fHasta}T23:59:59`)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [fUsuario, fAccion, fDesde, fHasta])

  return (
    <div className="p-6">
      <PageHeader
        title="Actividad"
        subtitle="Auditoría de acciones sensibles del equipo"
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 max-w-3xl">
        <Field label="Usuario">
          <Select value={fUsuario} onChange={(e) => setFUsuario(e.target.value)}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.auth_user_id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Acción">
          <Select value={fAccion} onChange={(e) => setFAccion(e.target.value)}>
            {ACCIONES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde">
          <TextInput type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <TextInput type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
        </Field>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Fecha y hora</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Sobre</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  No hay actividad registrada con estos filtros.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {fechaHora(r.fecha_hora)}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{r.usuario_nombre ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs border capitalize ${
                        ACCION_BADGE[r.accion] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      {ACCIONES.find((a) => a.id === r.accion)?.label ?? r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {TABLA_LABEL[r.tabla_afectada] ?? r.tabla_afectada}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{detalleTexto(r.detalle)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-600 mt-2 flex items-center gap-1.5">
        <ScrollText size={12} /> Se registran: cobro de pagos, edición de monto/estado y baja de
        contratos, cambios de % de comisión y envío de liquidaciones. Últimos 500 registros.
      </p>
    </div>
  )
}
