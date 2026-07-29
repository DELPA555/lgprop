import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, CalendarClock } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Contrato,
  Propiedad,
  Inquilino,
  Dueno,
  EstadoContrato,
  TipoIndice
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import { computeFechaFin, computeProximaActualizacion, daysUntil, todayISO } from '@/lib/dates'

type Form = Partial<Contrato>

const INDICES: TipoIndice[] = [
  'ICL',
  'IPC',
  'Casa Propia',
  'UVA',
  'Combinado',
  'Porcentaje fijo',
  'Manual'
]

const EMPTY: Form = {
  propiedad_id: '',
  inquilino_id: '',
  dueno_id: null,
  fecha_inicio: todayISO(),
  fecha_fin: '',
  monto_inicial: 0,
  monto_actual: 0,
  indice_actualizacion: 'ICL',
  indice_primario: null,
  indice_secundario: null,
  frecuencia_actualizacion_meses: 3,
  duracion_meses: 36,
  porcentaje_fijo: null,
  proxima_actualizacion: null,
  estado: 'activo',
  notas: ''
}

const ESTADO_BADGE: Record<EstadoContrato, string> = {
  activo: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  vencido: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  rescindido: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

export default function Contratos(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Contrato[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [duenos, setDuenos] = useState<Dueno[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contrato | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Contrato | null>(null)
  const [deleting, setDeleting] = useState(false)

  const propMap = useMemo(() => {
    const m: Record<string, Propiedad> = {}
    for (const p of propiedades) m[p.id] = p
    return m
  }, [propiedades])
  const inqMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const i of inquilinos) m[i.id] = i.nombre
    return m
  }, [inquilinos])
  const duenoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of duenos) m[d.id] = d.nombre
    return m
  }, [duenos])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [ctr, prop, inq, dus] = await Promise.all([
      supabase.from('contratos').select('*').order('fecha_fin'),
      supabase.from('propiedades').select('*').order('direccion'),
      supabase.from('inquilinos').select('*').order('nombre'),
      supabase.from('duenos').select('*').order('nombre')
    ])
    if (ctr.error) toast.error(ctr.error.message)
    setRows(ctr.data ?? [])
    setPropiedades(prop.data ?? [])
    setInquilinos(inq.data ?? [])
    setDuenos(dus.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      [propMap[r.propiedad_id]?.direccion, inqMap[r.inquilino_id], r.indice_actualizacion]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    )
  }, [rows, q, propMap, inqMap])

  // Patch con recálculo de campos derivados (fecha_fin y próxima actualización)
  const patch = (next: Partial<Form>): void => {
    setForm((prev) => {
      const m = { ...prev, ...next }
      if (next.fecha_inicio !== undefined || next.duracion_meses !== undefined) {
        m.fecha_fin = computeFechaFin(m.fecha_inicio ?? '', Number(m.duracion_meses) || 0)
      }
      if (
        next.fecha_inicio !== undefined ||
        next.frecuencia_actualizacion_meses !== undefined ||
        next.duracion_meses !== undefined
      ) {
        m.proxima_actualizacion = computeProximaActualizacion(
          m.fecha_inicio ?? '',
          Number(m.frecuencia_actualizacion_meses) || 0,
          m.fecha_fin ?? ''
        )
      }
      // Al crear, el monto actual acompaña al inicial hasta la primera actualización
      if (next.monto_inicial !== undefined && !editing) {
        m.monto_actual = Number(m.monto_inicial) || 0
      }
      // Autocompletar el dueño desde la propiedad elegida
      if (next.propiedad_id !== undefined && next.propiedad_id) {
        const p = propMap[next.propiedad_id]
        if (p?.dueno_id) m.dueno_id = p.dueno_id
      }
      return m
    })
  }

  const openCreate = (): void => {
    setEditing(null)
    setForm({ ...EMPTY, fecha_inicio: todayISO() })
    // pre-cálculo de derivados
    setTimeout(
      () =>
        setForm((f) => ({
          ...f,
          fecha_fin: computeFechaFin(f.fecha_inicio ?? '', Number(f.duracion_meses) || 0),
          proxima_actualizacion: computeProximaActualizacion(
            f.fecha_inicio ?? '',
            Number(f.frecuencia_actualizacion_meses) || 0,
            computeFechaFin(f.fecha_inicio ?? '', Number(f.duracion_meses) || 0)
          )
        })),
      0
    )
    setModalOpen(true)
  }
  const openEdit = (c: Contrato): void => {
    setEditing(c)
    setForm({ ...c })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.propiedad_id) return toast.error('Elegí una propiedad')
    if (!form.inquilino_id) return toast.error('Elegí un inquilino')
    if (!form.fecha_inicio || !form.fecha_fin) return toast.error('Completá las fechas del contrato')
    if (!form.monto_inicial || Number(form.monto_inicial) <= 0)
      return toast.error('El monto inicial debe ser mayor a 0')
    if (form.indice_actualizacion === 'Porcentaje fijo' && !form.porcentaje_fijo)
      return toast.error('Cargá el porcentaje fijo de actualización')
    if (
      form.indice_actualizacion === 'Combinado' &&
      (!form.indice_primario || !form.indice_secundario)
    )
      return toast.error('Elegí los dos índices para el modo combinado')

    setSaving(true)
    const payload = {
      propiedad_id: form.propiedad_id,
      inquilino_id: form.inquilino_id,
      dueno_id: form.dueno_id || null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      monto_inicial: Number(form.monto_inicial),
      monto_actual: Number(form.monto_actual) || Number(form.monto_inicial),
      indice_actualizacion: form.indice_actualizacion as TipoIndice,
      indice_primario:
        form.indice_actualizacion === 'Combinado' ? (form.indice_primario as TipoIndice) : null,
      indice_secundario:
        form.indice_actualizacion === 'Combinado' ? (form.indice_secundario as TipoIndice) : null,
      frecuencia_actualizacion_meses: Number(form.frecuencia_actualizacion_meses) || 1,
      duracion_meses: Number(form.duracion_meses) || 1,
      porcentaje_fijo:
        form.indice_actualizacion === 'Porcentaje fijo' ? Number(form.porcentaje_fijo) : null,
      proxima_actualizacion: form.proxima_actualizacion || null,
      estado: (form.estado ?? 'activo') as EstadoContrato,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('contratos').update(payload).eq('id', editing.id)
      : await supabase.from('contratos').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Contrato actualizado' : 'Contrato creado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('contratos').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Contrato eliminado')
    setDelTarget(null)
    void load()
  }

  const idx = form.indice_actualizacion

  return (
    <div className="p-6">
      <PageHeader
        title="Contratos"
        subtitle={`${rows.length} contrato${rows.length !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo contrato
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input w-full pl-9"
          placeholder="Buscar por propiedad, inquilino o índice…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Propiedad</th>
              <th className="px-4 py-3 font-medium">Inquilino</th>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 font-medium text-right">Monto actual</th>
              <th className="px-4 py-3 font-medium">Índice</th>
              <th className="px-4 py-3 font-medium">Próx. ajuste</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-600">
                  {rows.length === 0 ? 'Todavía no hay contratos cargados.' : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const dLeft = daysUntil(c.proxima_actualizacion)
                const proxSoon = dLeft !== null && dLeft <= 30
                return (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">
                      {propMap[c.propiedad_id]?.direccion ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{inqMap[c.inquilino_id] ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {formatDate(c.fecha_inicio)} → {formatDate(c.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200 tabular-nums">
                      {formatARS(c.monto_actual)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {c.indice_actualizacion === 'Combinado'
                        ? `${c.indice_primario ?? '?'} + ${c.indice_secundario ?? '?'}`
                        : c.indice_actualizacion}
                      {c.indice_actualizacion === 'Porcentaje fijo' && c.porcentaje_fijo
                        ? ` ${c.porcentaje_fijo}%`
                        : ''}
                      <div className="text-zinc-600">cada {c.frecuencia_actualizacion_meses} m</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.proxima_actualizacion ? (
                        <span
                          className={`inline-flex items-center gap-1 ${proxSoon ? 'text-amber-400' : 'text-zinc-400'}`}
                        >
                          {proxSoon && <CalendarClock size={12} />}
                          {formatDate(c.proxima_actualizacion)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs border capitalize ${ESTADO_BADGE[c.estado]}`}
                      >
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDelTarget(c)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-white/5"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar contrato' : 'Nuevo contrato'}
        onClose={() => setModalOpen(false)}
        wide
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
          {/* Partes */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Propiedad" required>
              <Select
                value={form.propiedad_id ?? ''}
                onChange={(e) => patch({ propiedad_id: e.target.value })}
              >
                <option value="">— Elegir —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inquilino" required>
              <Select
                value={form.inquilino_id ?? ''}
                onChange={(e) => patch({ inquilino_id: e.target.value })}
              >
                <option value="">— Elegir —</option>
                {inquilinos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Dueño (se autocompleta desde la propiedad)">
            <Select
              value={form.dueno_id ?? ''}
              onChange={(e) => patch({ dueno_id: e.target.value || null })}
            >
              <option value="">— Sin asignar —</option>
              {duenos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Field>

          {/* Fechas y duración */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Inicio" required>
              <TextInput
                type="date"
                value={form.fecha_inicio ?? ''}
                onChange={(e) => patch({ fecha_inicio: e.target.value })}
              />
            </Field>
            <Field label="Duración (meses)">
              <TextInput
                type="number"
                min={1}
                value={form.duracion_meses ?? 36}
                onChange={(e) => patch({ duracion_meses: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fin (calculado)">
              <TextInput
                type="date"
                value={form.fecha_fin ?? ''}
                onChange={(e) => patch({ fecha_fin: e.target.value })}
              />
            </Field>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto inicial" required>
              <TextInput
                type="number"
                min={0}
                value={form.monto_inicial ?? 0}
                onChange={(e) => patch({ monto_inicial: Number(e.target.value) })}
              />
            </Field>
            <Field label="Monto actual">
              <TextInput
                type="number"
                min={0}
                value={form.monto_actual ?? 0}
                onChange={(e) => patch({ monto_actual: Number(e.target.value) })}
              />
            </Field>
          </div>

          {/* Actualización */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              Actualización del alquiler
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Índice de actualización">
                <Select
                  value={idx ?? 'ICL'}
                  onChange={(e) => patch({ indice_actualizacion: e.target.value as TipoIndice })}
                >
                  {INDICES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Frecuencia (meses)">
                <TextInput
                  type="number"
                  min={1}
                  value={form.frecuencia_actualizacion_meses ?? 3}
                  onChange={(e) =>
                    patch({ frecuencia_actualizacion_meses: Number(e.target.value) })
                  }
                />
              </Field>
            </div>

            {idx === 'Combinado' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Primer índice" required>
                  <Select
                    value={form.indice_primario ?? ''}
                    onChange={(e) => patch({ indice_primario: e.target.value as TipoIndice })}
                  >
                    <option value="">— Elegir —</option>
                    {INDICES.filter((i) => i !== 'Combinado' && i !== 'Manual' && i !== 'Porcentaje fijo').map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Segundo índice (promedio)" required>
                  <Select
                    value={form.indice_secundario ?? ''}
                    onChange={(e) => patch({ indice_secundario: e.target.value as TipoIndice })}
                  >
                    <option value="">— Elegir —</option>
                    {INDICES.filter((i) => i !== 'Combinado' && i !== 'Manual' && i !== 'Porcentaje fijo').map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {idx === 'Porcentaje fijo' && (
              <div className="mt-3">
                <Field label="Porcentaje fijo por período (%)" required>
                  <TextInput
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.porcentaje_fijo ?? ''}
                    onChange={(e) => patch({ porcentaje_fijo: Number(e.target.value) })}
                  />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Próxima actualización (calculada)">
                <TextInput
                  type="date"
                  value={form.proxima_actualizacion ?? ''}
                  onChange={(e) => patch({ proxima_actualizacion: e.target.value || null })}
                />
              </Field>
              <Field label="Estado">
                <Select
                  value={form.estado ?? 'activo'}
                  onChange={(e) => patch({ estado: e.target.value as EstadoContrato })}
                >
                  <option value="activo">Activo</option>
                  <option value="vencido">Vencido</option>
                  <option value="rescindido">Rescindido</option>
                </Select>
              </Field>
            </div>
            {idx === 'Manual' && (
              <p className="text-[11px] text-zinc-600 mt-2">
                Con índice manual, el nuevo monto se carga a mano en cada actualización.
              </p>
            )}
          </div>

          <Field label="Notas">
            <TextArea
              value={form.notas ?? ''}
              onChange={(e) => patch({ notas: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el contrato de "${delTarget ? propMap[delTarget.propiedad_id]?.direccion ?? 'la propiedad' : ''}"? Se borrarán también sus pagos y actualizaciones asociadas.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
