import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Wrench, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Propiedad, Dueno, Mantenimiento, EstadoMantenimiento } from '@/types/database'
import ConfigNotice from '@/components/ConfigNotice'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import MantenimientoModal, { MANT_ESTADOS } from '@/components/MantenimientoModal'

export default function PropiedadDetalle(): JSX.Element {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [prop, setProp] = useState<Propiedad | null>(null)
  const [dueno, setDueno] = useState<Dueno | null>(null)
  const [reclamos, setReclamos] = useState<Mantenimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Mantenimiento | null>(null)
  const [delTarget, setDelTarget] = useState<Mantenimiento | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: p } = await supabase.from('propiedades').select('*').eq('id', id).maybeSingle()
    setProp(p ?? null)
    if (p?.dueno_id) {
      const { data: d } = await supabase.from('duenos').select('*').eq('id', p.dueno_id).maybeSingle()
      setDueno(d ?? null)
    } else {
      setDueno(null)
    }
    const { data: rec } = await supabase
      .from('mantenimiento')
      .select('*')
      .eq('propiedad_id', id)
      .order('fecha_reporte', { ascending: false })
    setReclamos(rec ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const comisionLabel = useMemo(() => {
    if (!prop) return '—'
    if (prop.porcentaje_comision != null) return `${prop.porcentaje_comision}% (propia)`
    if (dueno) return `${dueno.porcentaje_comision}% (heredada del dueño)`
    return '—'
  }, [prop, dueno])

  const setEstado = async (r: Mantenimiento, estado: EstadoMantenimiento): Promise<void> => {
    const fecha_resolucion =
      estado === 'resuelto' ? (r.fecha_resolucion ?? new Date().toISOString().slice(0, 10)) : null
    setReclamos((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, estado, fecha_resolucion } : x))
    )
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

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6">
        <ConfigNotice />
      </div>
    )
  }

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/propiedades')}
        className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4"
      >
        <ArrowLeft size={15} /> Volver a Propiedades
      </button>

      {loading && !prop ? (
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : !prop ? (
        <p className="text-zinc-500">No se encontró la propiedad.</p>
      ) : (
        <>
          {/* Info de la propiedad */}
          <div className="card p-5 mb-5">
            <h1 className="text-lg font-semibold text-white">{prop.direccion}</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Tipo</div>
                <div className="text-zinc-200 mt-0.5">{prop.tipo || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Dueño</div>
                <div className="text-zinc-200 mt-0.5">{dueno?.nombre || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Estado</div>
                <div className="text-zinc-200 mt-0.5 capitalize">{prop.estado}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Comisión</div>
                <div className="text-zinc-200 mt-0.5">{comisionLabel}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Expensas</div>
                <div className="text-zinc-200 mt-0.5">
                  {prop.monto_expensas > 0
                    ? `${formatARS(prop.monto_expensas)} · paga ${prop.paga_expensas}`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Mantenimiento / reclamos */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wrench size={16} className="text-zinc-400" /> Mantenimiento y reclamos
            </h2>
            <button
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={15} /> Nuevo reclamo
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-3 font-medium">Reportado</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Costo</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reclamos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                      Sin reclamos cargados para esta propiedad.
                    </td>
                  </tr>
                ) : (
                  reclamos.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                        {formatDate(r.fecha_reporte)}
                      </td>
                      <td className="px-4 py-3 text-zinc-200">
                        {r.descripcion}
                        {r.estado === 'resuelto' && r.fecha_resolucion && (
                          <div className="text-[11px] text-zinc-600">
                            Resuelto el {formatDate(r.fecha_resolucion)}
                          </div>
                        )}
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
        </>
      )}

      <MantenimientoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        propiedades={[]}
        fixedPropiedadId={id}
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
