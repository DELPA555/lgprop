import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Trash2, MapPin, User } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { EventoAgenda, EstadoEvento, Visita, Propiedad } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip, { ChipTone } from '@/components/ui/EstadoChip'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
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
const toLocalInput = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Tipos de evento (extensibles: la columna es texto, la UI sugiere estos) ──
const TIPOS: { value: string; label: string; tone: ChipTone }[] = [
  { value: 'tasacion', label: 'Tasación', tone: 'info' },
  { value: 'posible_ingreso', label: 'Posible ingreso', tone: 'ok' },
  { value: 'reunion', label: 'Reunión', tone: 'warn' },
  { value: 'visita', label: 'Visita', tone: 'muted' },
  { value: 'otro', label: 'Otro', tone: 'muted' }
]
const tipoMeta = (t: string): { value: string; label: string; tone: ChipTone } =>
  TIPOS.find((x) => x.value === t) ?? { value: t, label: t, tone: 'muted' }

const EV_ESTADO: Record<EstadoEvento, { tone: ChipTone; label: string }> = {
  pendiente: { tone: 'info', label: 'Pendiente' },
  realizado: { tone: 'ok', label: 'Realizado' },
  cancelado: { tone: 'muted', label: 'Cancelado' }
}

const PILL: Record<ChipTone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-info/15 text-info',
  muted: 'bg-white/[0.06] text-ink-2'
}

// Ítem unificado del calendario: evento (editable) o visita (solo lectura, superpuesta)
type CalItem = {
  id: string
  kind: 'evento' | 'visita'
  fecha: string
  label: string
  tone: ChipTone
  cancelado: boolean
  evento?: EventoAgenda
}

type Form = Partial<EventoAgenda> & { fechaLocal?: string }

export default function Agenda(): JSX.Element {
  const toast = useToast()
  const navigate = useNavigate()
  const { member } = useAuth()
  const [ym, setYm] = useState(currentYM())
  const [eventos, setEventos] = useState<EventoAgenda[]>([])
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EventoAgenda | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<EventoAgenda | null>(null)
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
    const [{ data: ev }, { data: v }, { data: p }] = await Promise.all([
      supabase.from('eventos_agenda').select('*').order('fecha_hora'),
      supabase.from('visitas').select('*').order('fecha'),
      supabase.from('propiedades').select('id, direccion, estado').order('direccion')
    ])
    setEventos(ev ?? [])
    setVisitas(v ?? [])
    setPropiedades((p as Propiedad[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  const labelEvento = (e: EventoAgenda): string => {
    const extra = e.propiedad_id ? propMap[e.propiedad_id] : e.contacto_nombre
    return extra ? `${e.titulo} · ${extra}` : e.titulo
  }
  const labelVisita = (v: Visita): string =>
    v.propiedad_id ? propMap[v.propiedad_id] ?? 'Visita' : v.visitante ?? 'Visita'

  // Todos los ítems (eventos + visitas) como CalItem
  const items = useMemo<CalItem[]>(() => {
    const evItems: CalItem[] = eventos.map((e) => ({
      id: `ev-${e.id}`,
      kind: 'evento',
      fecha: e.fecha_hora,
      label: labelEvento(e),
      tone: tipoMeta(e.tipo).tone,
      cancelado: e.estado === 'cancelado',
      evento: e
    }))
    const viItems: CalItem[] = visitas.map((v) => ({
      id: `vi-${v.id}`,
      kind: 'visita',
      fecha: v.fecha,
      label: labelVisita(v),
      tone: 'muted',
      cancelado: v.estado === 'cancelada'
    }))
    return [...evItems, ...viItems]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, visitas, propMap])

  const porDia = useMemo(() => {
    const m: Record<string, CalItem[]> = {}
    for (const it of items) {
      const k = keyOf(new Date(it.fecha))
      ;(m[k] ??= []).push(it)
    }
    return m
  }, [items])

  const proximos = useMemo(() => {
    const ahora = Date.now()
    return items
      .filter((it) => !it.cancelado && new Date(it.fecha).getTime() >= ahora)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      .slice(0, 10)
  }, [items])

  const celdas = useMemo(() => {
    const [y, m] = ym.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const startDow = (first.getDay() + 6) % 7
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
    base.setHours(10, 0, 0, 0)
    setForm({
      tipo: 'tasacion',
      estado: 'pendiente',
      fechaLocal: toLocalInput(base.toISOString())
    })
    setModalOpen(true)
  }
  const openEdit = (e: EventoAgenda): void => {
    setEditing(e)
    setForm({ ...e, fechaLocal: toLocalInput(e.fecha_hora) })
    setModalOpen(true)
  }
  const onItemClick = (it: CalItem): void => {
    if (it.kind === 'evento' && it.evento) openEdit(it.evento)
    else navigate('/visitas')
  }

  const save = async (): Promise<void> => {
    if (!form.titulo?.trim()) return toast.error('Poné un título')
    if (!form.fechaLocal) return toast.error('Elegí fecha y hora')
    setSaving(true)
    const iso = new Date(form.fechaLocal).toISOString()
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion?.trim() || null,
      fecha_hora: iso,
      tipo: form.tipo || 'otro',
      propiedad_id: form.propiedad_id || null,
      contacto_nombre: form.contacto_nombre?.trim() || null,
      contacto_telefono: form.contacto_telefono?.trim() || null,
      estado: (form.estado ?? 'pendiente') as EstadoEvento,
      // si cambia la fecha, permitir que el recordatorio se vuelva a evaluar
      recordatorio_enviado:
        editing && editing.fecha_hora === iso ? editing.recordatorio_enviado : false
    }
    const { error } = editing
      ? await supabase.from('eventos_agenda').update(payload).eq('id', editing.id)
      : await supabase.from('eventos_agenda').insert({ ...payload, creado_por: member?.id ?? null })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Evento actualizado' : 'Evento agendado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('eventos_agenda').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Evento eliminado')
    setDelTarget(null)
    void load()
  }

  const hoyKey = keyOf(new Date())
  const [y, m] = ym.split('-').map(Number)

  return (
    <div className="p-6">
      <PageHeader
        title="Agenda"
        subtitle="Agenda general del negocio: tasaciones, reuniones, posibles ingresos y más"
        actions={
          <button onClick={() => openCreate()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo evento
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Calendario mensual */}
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
              const dayItems = (porDia[k] ?? []).sort(
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
                    {dayItems.slice(0, 3).map((it) => (
                      <div
                        key={it.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onItemClick(it)
                        }}
                        className={`text-[10px] px-1 py-0.5 rounded truncate ${
                          it.cancelado
                            ? 'bg-white/[0.04] text-ink-3 line-through'
                            : PILL[it.tone]
                        } ${it.kind === 'visita' ? 'border border-dashed border-border' : ''}`}
                        title={`${hora(it.fecha)} · ${it.label}${it.kind === 'visita' ? ' (visita)' : ''}`}
                      >
                        {hora(it.fecha)} {it.label}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-ink-3">+{dayItems.length - 3} más</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Referencia */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border/60 text-[10px] text-ink-3">
            {TIPOS.map((t) => (
              <span key={t.value} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${PILL[t.tone].split(' ')[0]}`} />
                {t.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-dashed border-ink-3" /> Visita (solo lectura)
            </span>
          </div>
        </div>

        {/* Próximos eventos */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <CalendarDays size={15} className="text-ink-3" /> Próximos eventos
          </h2>
          {loading ? (
            <p className="text-sm text-ink-3">Cargando…</p>
          ) : proximos.length === 0 ? (
            <p className="text-sm text-ink-3">No hay eventos próximos.</p>
          ) : (
            <div className="space-y-2">
              {proximos.map((it) => {
                const d = new Date(it.fecha)
                const ev = it.evento
                return (
                  <div
                    key={it.id}
                    onClick={() => onItemClick(it)}
                    className="w-full text-left rounded-lg border border-border p-2.5 hover:bg-white/[0.03] cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white truncate">
                        {ev ? ev.titulo : it.label}
                      </span>
                      {ev ? (
                        <EstadoChip tone={tipoMeta(ev.tipo).tone}>{tipoMeta(ev.tipo).label}</EstadoChip>
                      ) : (
                        <EstadoChip tone="muted">Visita</EstadoChip>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-3 mt-0.5 num flex items-center gap-1.5">
                      <span>
                        {d.getDate()} {MESES[d.getMonth()].slice(0, 3)} · {hora(it.fecha)}
                      </span>
                      {ev?.propiedad_id && propMap[ev.propiedad_id] && (
                        <span className="text-ink-2 flex items-center gap-1">
                          · <MapPin size={11} /> {propMap[ev.propiedad_id]}
                        </span>
                      )}
                      {ev && !ev.propiedad_id && ev.contacto_nombre && (
                        <span className="text-ink-2 flex items-center gap-1">
                          · <User size={11} /> {ev.contacto_nombre}
                        </span>
                      )}
                    </div>
                    {ev?.contacto_telefono && (
                      <div className="mt-1">
                        <TelefonoWhatsApp numero={ev.contacto_telefono} size={13} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar evento' : 'Nuevo evento'}
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
          <Field label="Título" required>
            <TextInput
              autoFocus
              placeholder="Ej: Tasación depto Rivadavia 1200"
              value={form.titulo ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select
                value={form.tipo ?? 'tasacion'}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                {/* Si el evento venía con un tipo custom fuera de la lista, lo preservamos */}
                {form.tipo && !TIPOS.some((t) => t.value === form.tipo) && (
                  <option value={form.tipo}>{form.tipo}</option>
                )}
              </Select>
            </Field>
            <Field label="Fecha y hora" required>
              <TextInput
                type="datetime-local"
                value={form.fechaLocal ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fechaLocal: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Estado">
            <Select
              value={form.estado ?? 'pendiente'}
              onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoEvento }))}
            >
              <option value="pendiente">Pendiente</option>
              <option value="realizado">Realizado</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </Field>

          <div className="rounded-lg border border-border/70 p-3 space-y-3">
            <p className="text-[11px] text-ink-3 -mb-1">
              Vinculá el evento a una propiedad cargada, o dejá los datos de un contacto libre (si
              todavía no está en el sistema). Ambos son opcionales.
            </p>
            <Field label="Propiedad (opcional)">
              <Select
                value={form.propiedad_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, propiedad_id: e.target.value || null }))}
              >
                <option value="">— Sin vincular —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                    {p.estado === 'vacia' ? ' · vacía' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contacto (nombre)">
                <TextInput
                  placeholder="Ej: Marcelo (posible cliente)"
                  value={form.contacto_nombre ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, contacto_nombre: e.target.value }))}
                />
              </Field>
              <Field label="Teléfono">
                <div className="flex items-center gap-1.5">
                  <TextInput
                    placeholder="Ej: 223 555-1234"
                    value={form.contacto_telefono ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, contacto_telefono: e.target.value }))}
                  />
                  <TelefonoWhatsApp numero={form.contacto_telefono} iconOnly size={18} />
                </div>
              </Field>
            </div>
          </div>

          <Field label="Descripción">
            <TextArea
              placeholder="Notas, detalles del evento…"
              value={form.descripcion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message="¿Eliminar este evento de la agenda?"
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
