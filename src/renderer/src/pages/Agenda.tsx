import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Trash2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Visita, EstadoVisita, Propiedad, Interesado, UsuarioEquipo } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip, { ChipTone } from '@/components/ui/EstadoChip'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const pad = (n: number): string => String(n).padStart(2, '0')
const keyOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hora = (iso: string): string => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const currentYM = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
// ISO local -> valor para <input type="datetime-local">
const toLocalInput = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ESTADO_TONE: Record<EstadoVisita, ChipTone> = {
  programada: 'info',
  realizada: 'ok',
  cancelada: 'muted'
}
const ESTADO_LABEL: Record<EstadoVisita, string> = {
  programada: 'Programada',
  realizada: 'Realizada',
  cancelada: 'Cancelada'
}

type Form = Partial<Visita> & { fechaLocal?: string }

export default function Agenda(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [ym, setYm] = useState(currentYM())
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [interesados, setInteresados] = useState<Interesado[]>([])
  const [equipo, setEquipo] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Visita | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Visita | null>(null)
  const [deleting, setDeleting] = useState(false)

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of propiedades) m[p.id] = p.direccion
    return m
  }, [propiedades])
  const equipoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of equipo) m[e.id] = e.nombre
    return m
  }, [equipo])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: v }, { data: p }, { data: i }, { data: e }] = await Promise.all([
      supabase.from('visitas').select('*').order('fecha'),
      supabase.from('propiedades').select('id, direccion, estado').order('direccion'),
      supabase.from('interesados').select('*').order('nombre'),
      supabase.from('usuarios_equipo').select('*').order('nombre')
    ])
    setVisitas(v ?? [])
    setPropiedades((p as Propiedad[]) ?? [])
    setInteresados(i ?? [])
    setEquipo(e ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  // Visitas agrupadas por día (clave local YYYY-MM-DD)
  const porDia = useMemo(() => {
    const m: Record<string, Visita[]> = {}
    for (const v of visitas) {
      const k = keyOf(new Date(v.fecha))
      ;(m[k] ??= []).push(v)
    }
    return m
  }, [visitas])

  const proximas = useMemo(() => {
    const ahora = Date.now()
    return visitas
      .filter((v) => v.estado === 'programada' && new Date(v.fecha).getTime() >= ahora)
      .slice(0, 8)
  }, [visitas])

  // Grilla del mes (semanas de lunes a domingo)
  const celdas = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const startDow = (first.getDay() + 6) % 7 // lunes = 0
    const diasMes = new Date(y, m, 0).getDate()
    const arr: (Date | null)[] = []
    for (let i = 0; i < startDow; i++) arr.push(null)
    for (let d = 1; d <= diasMes; d++) arr.push(new Date(y, m - 1, d))
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [ym])

  const cambiarMes = (delta: number): void => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  const openCreate = (fecha?: Date): void => {
    setEditing(null)
    const base = fecha ?? new Date()
    if (!fecha) base.setHours(10, 0, 0, 0)
    else base.setHours(10, 0, 0, 0)
    setForm({
      estado: 'programada',
      asignado_a: member?.id ?? null,
      fechaLocal: toLocalInput(base.toISOString())
    })
    setModalOpen(true)
  }
  const openEdit = (v: Visita): void => {
    setEditing(v)
    setForm({ ...v, fechaLocal: toLocalInput(v.fecha) })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.fechaLocal) return toast.error('Elegí fecha y hora')
    if (!form.propiedad_id && !form.visitante?.trim())
      return toast.error('Elegí una propiedad o poné el nombre del visitante')
    setSaving(true)
    const iso = new Date(form.fechaLocal).toISOString()
    const inq = form.interesado_id ? interesados.find((i) => i.id === form.interesado_id) : null
    const payload = {
      propiedad_id: form.propiedad_id || null,
      interesado_id: form.interesado_id || null,
      visitante: form.visitante?.trim() || inq?.nombre || null,
      fecha: iso,
      asignado_a: form.asignado_a || null,
      estado: (form.estado ?? 'programada') as EstadoVisita,
      notas: form.notas || null,
      // si cambia la fecha, permitir que el recordatorio se vuelva a evaluar
      recordatorio_enviado: editing && editing.fecha === iso ? editing.recordatorio_enviado : false
    }
    const { error } = editing
      ? await supabase.from('visitas').update(payload).eq('id', editing.id)
      : await supabase.from('visitas').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Visita actualizada' : 'Visita agendada')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('visitas').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Visita eliminada')
    setDelTarget(null)
    void load()
  }

  const labelVisita = (v: Visita): string =>
    v.propiedad_id ? propMap[v.propiedad_id] ?? 'Propiedad' : v.visitante ?? 'Visita'

  const hoyKey = keyOf(new Date())
  const [y, m] = ym.split('-').map(Number)

  return (
    <div className="p-6">
      <PageHeader
        title="Agenda de visitas"
        subtitle="Coordiná las visitas a las propiedades"
        actions={
          <button onClick={() => openCreate()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nueva visita
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Calendario */}
        <div className="xl:col-span-2 card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">
              {MESES[m - 1]} {y}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => cambiarMes(-1)}
                className="p-1.5 rounded-md border border-border text-ink-2 hover:text-ink"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setYm(currentYM())}
                className="px-2 py-1 rounded-md border border-border text-xs text-ink-2 hover:text-ink"
              >
                Hoy
              </button>
              <button
                onClick={() => cambiarMes(1)}
                className="p-1.5 rounded-md border border-border text-ink-2 hover:text-ink"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3 uppercase tracking-wider mb-1">
            {DOW.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-[76px] rounded-lg" />
              const k = keyOf(d)
              const items = (porDia[k] ?? []).sort(
                (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
              )
              const esHoy = k === hoyKey
              return (
                <button
                  key={idx}
                  onClick={() => openCreate(d)}
                  className={`min-h-[76px] text-left rounded-lg border p-1.5 transition-colors ${
                    esHoy ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-white/[0.03]'
                  }`}
                >
                  <div className={`text-xs num ${esHoy ? 'text-accent font-semibold' : 'text-ink-3'}`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {items.slice(0, 3).map((v) => (
                      <div
                        key={v.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(v)
                        }}
                        className={`text-[10px] px-1 py-0.5 rounded truncate ${
                          v.estado === 'cancelada'
                            ? 'bg-white/[0.04] text-ink-3 line-through'
                            : v.estado === 'realizada'
                              ? 'bg-ok/15 text-ok'
                              : 'bg-info/15 text-info'
                        }`}
                        title={`${hora(v.fecha)} · ${labelVisita(v)}`}
                      >
                        {hora(v.fecha)} {labelVisita(v)}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[10px] text-ink-3">+{items.length - 3} más</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Próximas visitas */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <CalendarDays size={15} className="text-ink-3" /> Próximas visitas
          </h2>
          {loading ? (
            <p className="text-sm text-ink-3">Cargando…</p>
          ) : proximas.length === 0 ? (
            <p className="text-sm text-ink-3">No hay visitas programadas.</p>
          ) : (
            <div className="space-y-2">
              {proximas.map((v) => {
                const d = new Date(v.fecha)
                return (
                  <button
                    key={v.id}
                    onClick={() => openEdit(v)}
                    className="w-full text-left rounded-lg border border-border p-2.5 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white truncate">{labelVisita(v)}</span>
                      <EstadoChip tone={ESTADO_TONE[v.estado]}>{ESTADO_LABEL[v.estado]}</EstadoChip>
                    </div>
                    <div className="text-[11px] text-ink-3 mt-0.5 num">
                      {d.getDate()} {MESES[d.getMonth()].slice(0, 3)} · {hora(v.fecha)}
                      {v.asignado_a && (
                        <span className="text-ink-2"> · {equipoMap[v.asignado_a] ?? ''}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar visita' : 'Nueva visita'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {editing && (
              <button
                onClick={() => {
                  setModalOpen(false)
                  setDelTarget(editing)
                }}
                className="mr-auto flex items-center gap-1.5 text-sm text-ink-3 hover:text-bad"
              >
                <Trash2 size={14} /> Eliminar
              </button>
            )}
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
            <Field label="Fecha y hora" required>
              <TextInput
                type="datetime-local"
                value={form.fechaLocal ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fechaLocal: e.target.value }))}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={form.estado ?? 'programada'}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoVisita }))}
              >
                <option value="programada">Programada</option>
                <option value="realizada">Realizada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </Field>
          </div>
          <Field label="Propiedad">
            <Select
              value={form.propiedad_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, propiedad_id: e.target.value || null }))}
            >
              <option value="">— Sin especificar —</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.direccion}
                  {p.estado === 'vacia' ? ' · vacía' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interesado (del pipeline)">
              <Select
                value={form.interesado_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, interesado_id: e.target.value || null }))}
              >
                <option value="">— Ninguno —</option>
                {interesados.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Visitante (si no está en el pipeline)">
              <TextInput
                value={form.visitante ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, visitante: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Coordina (del equipo)">
            <Select
              value={form.asignado_a ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, asignado_a: e.target.value || null }))}
            >
              <option value="">— Sin asignar —</option>
              {equipo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {member?.id === e.id ? ' (vos)' : ''}
                </option>
              ))}
            </Select>
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
        message="¿Eliminar esta visita de la agenda?"
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
