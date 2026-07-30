import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, CheckSquare } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Tarea, PrioridadTarea, UsuarioEquipo, Propiedad } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip from '@/components/ui/EstadoChip'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/format'
import { daysUntil } from '@/lib/dates'

type Filtro = 'pendientes' | 'todas' | 'hechas'
type Form = Partial<Tarea>

const prioridadChip = (p: PrioridadTarea): JSX.Element | null => {
  if (p === 'alta') return <EstadoChip tone="bad">alta</EstadoChip>
  if (p === 'baja') return <EstadoChip tone="muted">baja</EstadoChip>
  return null
}

export default function Tareas(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [rows, setRows] = useState<Tarea[]>([])
  const [equipo, setEquipo] = useState<UsuarioEquipo[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [quick, setQuick] = useState('')
  const [quickPrio, setQuickPrio] = useState<PrioridadTarea>('normal')
  const [adding, setAdding] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Tarea | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Tarea | null>(null)
  const [deleting, setDeleting] = useState(false)

  const equipoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of equipo) m[e.id] = e.nombre
    return m
  }, [equipo])
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
    const [{ data: t }, { data: eq }, { data: pr }] = await Promise.all([
      supabase
        .from('tareas')
        .select('*')
        .order('completada')
        .order('fecha_limite', { nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('usuarios_equipo').select('*').order('nombre'),
      supabase.from('propiedades').select('id, direccion').order('direccion')
    ])
    setRows(t ?? [])
    setEquipo(eq ?? [])
    setPropiedades((pr as Propiedad[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (filtro === 'todas') return rows
    return rows.filter((r) => (filtro === 'hechas' ? r.completada : !r.completada))
  }, [rows, filtro])
  const pendientesCount = useMemo(() => rows.filter((r) => !r.completada).length, [rows])

  const quickAdd = async (): Promise<void> => {
    if (!quick.trim()) return
    setAdding(true)
    const { error } = await supabase.from('tareas').insert({
      titulo: quick.trim(),
      prioridad: quickPrio,
      asignado_a: member?.id ?? null,
      creada_por: member?.id ?? null
    })
    setAdding(false)
    if (error) return void toast.error(error.message)
    setQuick('')
    setQuickPrio('normal')
    void load()
  }

  const toggle = async (t: Tarea): Promise<void> => {
    const completada = !t.completada
    const completada_at = completada ? new Date().toISOString() : null
    setRows((prev) => prev.map((x) => (x.id === t.id ? { ...x, completada, completada_at } : x)))
    const { error } = await supabase
      .from('tareas')
      .update({ completada, completada_at })
      .eq('id', t.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const openEdit = (t: Tarea): void => {
    setEditing(t)
    setForm({ ...t })
    setModalOpen(true)
  }
  const openCreate = (): void => {
    setEditing(null)
    setForm({ prioridad: 'normal', asignado_a: member?.id ?? null })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.titulo?.trim()) return toast.error('Poné un título')
    setSaving(true)
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion || null,
      prioridad: (form.prioridad ?? 'normal') as PrioridadTarea,
      asignado_a: form.asignado_a || null,
      propiedad_id: form.propiedad_id || null,
      fecha_limite: form.fecha_limite || null
    }
    const { error } = editing
      ? await supabase.from('tareas').update(payload).eq('id', editing.id)
      : await supabase.from('tareas').insert({ ...payload, creada_por: member?.id ?? null })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Tarea actualizada' : 'Tarea creada')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('tareas').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Tarea eliminada')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Tareas"
        subtitle={`${pendientesCount} pendiente${pendientesCount !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-ghost flex items-center gap-2 text-sm">
            <Plus size={15} /> Con detalle
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Captura rápida */}
      <div className="card p-3 mb-4 flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder="Anotá algo rápido… (ej: llamar al plomero de Rivadavia 2500)"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void quickAdd()
          }}
        />
        <Select value={quickPrio} onChange={(e) => setQuickPrio(e.target.value as PrioridadTarea)}>
          <option value="baja">Baja</option>
          <option value="normal">Normal</option>
          <option value="alta">Alta</option>
        </Select>
        <button
          onClick={quickAdd}
          disabled={adding || !quick.trim()}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Agregar
        </button>
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5 mb-4 w-fit">
        {(['pendientes', 'todas', 'hechas'] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
              filtro === f ? 'bg-accent text-[#04110f] font-medium' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-ink-3 text-sm">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-ink-3 text-sm">
            <CheckSquare size={26} className="mx-auto mb-2 text-ink-3" />
            {filtro === 'pendientes' ? '¡Sin pendientes! 🎉' : 'No hay tareas.'}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((t) => {
              const dLeft = daysUntil(t.fecha_limite)
              const vencida = !t.completada && dLeft !== null && dLeft < 0
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] group">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 accent-accent shrink-0"
                    checked={t.completada}
                    onChange={() => toggle(t)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm ${
                          t.completada ? 'text-ink-3 line-through' : 'text-ink'
                        }`}
                      >
                        {t.titulo}
                      </span>
                      {!t.completada && prioridadChip(t.prioridad)}
                    </div>
                    {t.descripcion && (
                      <p className="text-xs text-ink-3 mt-0.5 whitespace-pre-wrap">{t.descripcion}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-3 flex-wrap">
                      {t.asignado_a && <span>{equipoMap[t.asignado_a] ?? '—'}</span>}
                      {t.propiedad_id && (
                        <span className="text-ink-2">{propMap[t.propiedad_id] ?? 'propiedad'}</span>
                      )}
                      {t.fecha_limite && (
                        <span className={vencida ? 'text-bad' : ''}>
                          {vencida ? 'venció ' : 'vence '}
                          {formatDate(t.fecha_limite)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDelTarget(t)}
                      className="p-1.5 rounded-md text-ink-2 hover:text-bad hover:bg-white/5"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar tarea' : 'Nueva tarea'}
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
          <Field label="Título" required>
            <TextInput
              value={form.titulo ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              autoFocus
            />
          </Field>
          <Field label="Descripción">
            <TextArea
              value={form.descripcion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <Select
                value={form.prioridad ?? 'normal'}
                onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value as PrioridadTarea }))}
              >
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </Select>
            </Field>
            <Field label="Vence">
              <TextInput
                type="date"
                value={form.fecha_limite ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha_limite: e.target.value || null }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asignada a">
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
            <Field label="Propiedad (opcional)">
              <Select
                value={form.propiedad_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, propiedad_id: e.target.value || null }))}
              >
                <option value="">— Ninguna —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar la tarea "${delTarget?.titulo}"?`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
