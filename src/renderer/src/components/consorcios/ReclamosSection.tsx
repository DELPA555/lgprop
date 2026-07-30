import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { ReclamoConsorcio, UnidadFuncional, EstadoMantenimiento } from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { MANT_ESTADOS } from '@/components/MantenimientoModal'

type Form = Partial<ReclamoConsorcio>

export default function ReclamosSection({ consorcioId }: { consorcioId: string }): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<ReclamoConsorcio[]>([])
  const [unidades, setUnidades] = useState<UnidadFuncional[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | EstadoMantenimiento>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ReclamoConsorcio | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<ReclamoConsorcio | null>(null)
  const [deleting, setDeleting] = useState(false)

  const unidadMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of unidades) m[u.id] = u.identificador
    return m
  }, [unidades])

  const load = async (): Promise<void> => {
    setLoading(true)
    const [{ data: rec }, { data: uni }] = await Promise.all([
      supabase
        .from('reclamos_consorcio')
        .select('*')
        .eq('consorcio_id', consorcioId)
        .order('fecha_reporte', { ascending: false }),
      supabase
        .from('unidades_funcionales')
        .select('*')
        .eq('consorcio_id', consorcioId)
        .order('identificador')
    ])
    setRows(rec ?? [])
    setUnidades(uni ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [consorcioId])

  const filtered = useMemo(
    () => (filtro === 'todos' ? rows : rows.filter((r) => r.estado === filtro)),
    [rows, filtro]
  )
  const abiertos = useMemo(() => rows.filter((r) => r.estado !== 'resuelto').length, [rows])

  const openCreate = (): void => {
    setEditing(null)
    setForm({ estado: 'pendiente', unidad_id: null })
    setModalOpen(true)
  }
  const openEdit = (r: ReclamoConsorcio): void => {
    setEditing(r)
    setForm({ ...r })
    setModalOpen(true)
  }

  const setEstado = async (r: ReclamoConsorcio, estado: EstadoMantenimiento): Promise<void> => {
    const fecha_resolucion = estado === 'resuelto' ? (r.fecha_resolucion ?? todayISO()) : null
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado, fecha_resolucion } : x)))
    const { error } = await supabase
      .from('reclamos_consorcio')
      .update({ estado, fecha_resolucion })
      .eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const save = async (): Promise<void> => {
    if (!form.descripcion?.trim()) return toast.error('Describí el reclamo')
    setSaving(true)
    const payload = {
      consorcio_id: consorcioId,
      unidad_id: form.unidad_id || null,
      descripcion: form.descripcion.trim(),
      estado: (form.estado ?? 'pendiente') as EstadoMantenimiento,
      fecha_resolucion:
        form.estado === 'resuelto' ? form.fecha_resolucion || todayISO() : null,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('reclamos_consorcio').update(payload).eq('id', editing.id)
      : await supabase.from('reclamos_consorcio').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Reclamo actualizado' : 'Reclamo cargado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('reclamos_consorcio').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Reclamo eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Wrench size={16} className="text-ink-3" /> Reclamos
          {abiertos > 0 && <span className="chip chip-warn">{abiertos} abierto(s)</span>}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
            {(['todos', 'pendiente', 'en_proceso', 'resuelto'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                  filtro === f ? 'bg-accent text-[#04110f] font-medium' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {f === 'en_proceso' ? 'en proceso' : f}
              </button>
            ))}
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Nuevo reclamo
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Reportado</th>
              <th className="px-4 py-3 font-medium">Unidad</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                  {rows.length === 0 ? 'Sin reclamos cargados.' : 'Sin reclamos con ese filtro.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-3 text-xs whitespace-nowrap">
                    {formatDate(r.fecha_reporte)}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {r.unidad_id ? unidadMap[r.unidad_id] ?? '—' : 'General'}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {r.descripcion}
                    {r.estado === 'resuelto' && r.fecha_resolucion && (
                      <div className="text-[11px] text-ink-3">
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
                              : 'border-transparent text-ink-3 hover:text-ink-2'
                          }`}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(r)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-bad hover:bg-white/5"
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

      <Modal
        open={modalOpen}
        title={editing ? 'Editar reclamo' : 'Nuevo reclamo'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidad (opcional)">
              <Select
                value={form.unidad_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, unidad_id: e.target.value || null }))}
              >
                <option value="">General (todo el edificio)</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.identificador}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select
                value={form.estado ?? 'pendiente'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estado: e.target.value as EstadoMantenimiento }))
                }
              >
                {MANT_ESTADOS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descripción" required>
            <TextArea
              value={form.descripcion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Ej: filtración en el palier del 4° piso"
              className="min-h-[90px]"
            />
          </Field>
          <Field label="Notas">
            <TextArea
              value={form.notas ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message="¿Eliminar este reclamo? Esta acción no se puede deshacer."
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </>
  )
}
