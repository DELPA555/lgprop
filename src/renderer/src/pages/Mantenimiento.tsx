import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, ExternalLink } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Mantenimiento as Reclamo, Propiedad, EstadoMantenimiento } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import MantenimientoModal, { MANT_ESTADOS } from '@/components/MantenimientoModal'

type Filtro = 'todos' | EstadoMantenimiento

export default function Mantenimiento(): JSX.Element {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Reclamo[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendiente')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Reclamo | null>(null)
  const [delTarget, setDelTarget] = useState<Reclamo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of propiedades) m[p.id] = p.direccion
    return m
  }, [propiedades])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [rec, props] = await Promise.all([
      supabase.from('mantenimiento').select('*').order('fecha_reporte', { ascending: false }),
      supabase.from('propiedades').select('*').order('direccion')
    ])
    setRows(rec.data ?? [])
    setPropiedades(props.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const counts = useMemo(() => {
    return {
      pendiente: rows.filter((r) => r.estado === 'pendiente').length,
      en_proceso: rows.filter((r) => r.estado === 'en_proceso').length,
      resuelto: rows.filter((r) => r.estado === 'resuelto').length
    }
  }, [rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows
      .filter((r) => (filtro === 'todos' ? true : r.estado === filtro))
      .filter((r) =>
        s
          ? `${propMap[r.propiedad_id] ?? ''} ${r.descripcion}`.toLowerCase().includes(s)
          : true
      )
  }, [rows, q, filtro, propMap])

  const setEstado = async (r: Reclamo, estado: EstadoMantenimiento): Promise<void> => {
    const fecha_resolucion =
      estado === 'resuelto' ? (r.fecha_resolucion ?? new Date().toISOString().slice(0, 10)) : null
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado, fecha_resolucion } : x)))
    const { error } = await supabase
      .from('mantenimiento')
      .update({ estado, fecha_resolucion })
      .eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('mantenimiento').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Reclamo eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Mantenimiento"
        subtitle={`${counts.pendiente} pendiente${counts.pendiente !== 1 ? 's' : ''} · ${counts.en_proceso} en proceso`}
        actions={
          <button
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> Nuevo reclamo
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar por propiedad o descripción…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
          {(['todos', 'pendiente', 'en_proceso', 'resuelto'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                filtro === f ? 'bg-accent text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'todos'
                ? 'Todos'
                : (MANT_ESTADOS.find((e) => e.id === f)?.label ?? f)}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Propiedad</th>
              <th className="px-4 py-3 font-medium">Reportado</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Costo</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-600">
                  {rows.length === 0
                    ? 'Todavía no hay reclamos cargados.'
                    : 'Sin reclamos con este filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/propiedades/${r.propiedad_id}`)}
                      className="inline-flex items-center gap-1 text-white hover:text-accent"
                    >
                      {propMap[r.propiedad_id] ?? '—'}
                      <ExternalLink size={12} className="text-zinc-600" />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                    {formatDate(r.fecha_reporte)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300 max-w-xs">
                    <div className="truncate" title={r.descripcion}>
                      {r.descripcion}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {MANT_ESTADOS.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setEstado(r, e.id)}
                          className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                            r.estado === e.id
                              ? e.badge
                              : 'border-transparent text-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">
                    {r.costo != null ? formatARS(r.costo) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing(r)
                          setModalOpen(true)
                        }}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(r)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-white/5"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MantenimientoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        propiedades={propiedades}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!delTarget}
        message="¿Eliminar este reclamo? Esta acción no se puede deshacer."
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
