import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserPlus, ArrowRight, RotateCcw, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Interesado, EstadoInteresado, Propiedad } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/format'

type Form = Partial<Interesado>

const COLS: { estado: EstadoInteresado; titulo: string; tone: string; dot: string }[] = [
  { estado: 'interesado', titulo: 'Interesados', tone: 'text-warn', dot: 'bg-warn' },
  { estado: 'reservo', titulo: 'Reservaron', tone: 'text-ok', dot: 'bg-ok' },
  { estado: 'descartado', titulo: 'Descartados', tone: 'text-ink-3', dot: 'bg-ink-3' }
]

export default function Prospectos(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [rows, setRows] = useState<Interesado[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProp, setFiltroProp] = useState<string>('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Interesado | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Interesado | null>(null)
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
    const [{ data: i }, { data: p }] = await Promise.all([
      supabase.from('interesados').select('*').order('created_at', { ascending: false }),
      supabase.from('propiedades').select('id, direccion, estado').order('direccion')
    ])
    setRows(i ?? [])
    setPropiedades((p as Propiedad[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  const visibles = useMemo(
    () => (filtroProp === 'todas' ? rows : rows.filter((r) => r.propiedad_id === filtroProp)),
    [rows, filtroProp]
  )

  const openCreate = (): void => {
    setEditing(null)
    setForm({
      estado: 'interesado',
      propiedad_id: filtroProp !== 'todas' ? filtroProp : null,
      fecha_consulta: new Date().toISOString().slice(0, 10)
    })
    setModalOpen(true)
  }
  const openEdit = (r: Interesado): void => {
    setEditing(r)
    setForm({ ...r })
    setModalOpen(true)
  }

  const mover = async (r: Interesado, estado: EstadoInteresado): Promise<void> => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado } : x)))
    const { error } = await supabase.from('interesados').update({ estado }).eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const save = async (): Promise<void> => {
    if (!form.nombre?.trim()) return toast.error('Poné el nombre del interesado')
    setSaving(true)
    const payload = {
      propiedad_id: form.propiedad_id || null,
      nombre: form.nombre.trim(),
      telefono: form.telefono || null,
      email: form.email || null,
      fecha_consulta: form.fecha_consulta || new Date().toISOString().slice(0, 10),
      fecha_visita: form.fecha_visita || null,
      estado: (form.estado ?? 'interesado') as EstadoInteresado,
      origen: form.origen || null,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('interesados').update(payload).eq('id', editing.id)
      : await supabase.from('interesados').insert({ ...payload, creado_por: member?.id ?? null })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Interesado actualizado' : 'Interesado agregado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('interesados').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Interesado eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Prospectos"
        subtitle="Quién preguntó por qué propiedad"
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={16} /> Nuevo interesado
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="mb-4 max-w-xs">
        <Select value={filtroProp} onChange={(e) => setFiltroProp(e.target.value)}>
          <option value="todas">Todas las propiedades</option>
          {propiedades.map((p) => (
            <option key={p.id} value={p.id}>
              {p.direccion}
              {p.estado === 'vacia' ? ' · vacía' : ''}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-ink-3 text-sm">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map((col) => {
            const items = visibles.filter((r) => r.estado === col.estado)
            return (
              <div key={col.estado} className="flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h2 className={`text-sm font-semibold ${col.tone}`}>{col.titulo}</h2>
                  <span className="text-xs text-ink-3 num">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {items.length === 0 ? (
                    <div className="card p-4 text-center text-xs text-ink-3 border-dashed">
                      Sin interesados
                    </div>
                  ) : (
                    items.map((r) => (
                      <div key={r.id} className="card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm text-white font-medium truncate">{r.nombre}</div>
                            {r.propiedad_id && (
                              <div className="text-[11px] text-ink-3 truncate">
                                {propMap[r.propiedad_id] ?? 'propiedad'}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => openEdit(r)}
                              className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-white/5"
                              title="Editar"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDelTarget(r)}
                              className="p-1 rounded-md text-ink-3 hover:text-bad hover:bg-white/5"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-3">
                          {r.telefono && <TelefonoWhatsApp numero={r.telefono} size={13} />}
                          <span>
                            {r.fecha_visita
                              ? `visitó ${formatDate(r.fecha_visita)}`
                              : `consultó ${formatDate(r.fecha_consulta)}`}
                          </span>
                        </div>
                        {r.notas && (
                          <p className="text-[11px] text-ink-2 mt-1.5 line-clamp-2 whitespace-pre-wrap">
                            {r.notas}
                          </p>
                        )}
                        {/* Mover de estado */}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60">
                          {col.estado !== 'interesado' && (
                            <button
                              onClick={() => mover(r, 'interesado')}
                              className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-warn"
                            >
                              <RotateCcw size={11} /> Interesado
                            </button>
                          )}
                          {col.estado !== 'reservo' && (
                            <button
                              onClick={() => mover(r, 'reservo')}
                              className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ok ml-auto"
                            >
                              <ArrowRight size={11} /> Reservó
                            </button>
                          )}
                          {col.estado !== 'descartado' && (
                            <button
                              onClick={() => mover(r, 'descartado')}
                              className={`flex items-center gap-1 text-[11px] text-ink-3 hover:text-bad ${
                                col.estado === 'reservo' ? 'ml-auto' : ''
                              }`}
                            >
                              <X size={11} /> Descartar
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Editar interesado' : 'Nuevo interesado'}
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
            <Field label="Nombre" required>
              <TextInput
                value={form.nombre ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                autoFocus
              />
            </Field>
            <Field label="Propiedad de interés">
              <Select
                value={form.propiedad_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, propiedad_id: e.target.value || null }))}
              >
                <option value="">— Sin especificar —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <TextInput
                value={form.telefono ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <TextInput
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Fecha de consulta">
              <TextInput
                type="date"
                value={form.fecha_consulta ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha_consulta: e.target.value }))}
              />
            </Field>
            <Field label="Cuándo visitó">
              <TextInput
                type="date"
                value={form.fecha_visita ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha_visita: e.target.value || null }))}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={form.estado ?? 'interesado'}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoInteresado }))}
              >
                <option value="interesado">Interesado</option>
                <option value="reservo">Reservó</option>
                <option value="descartado">Descartado</option>
              </Select>
            </Field>
          </div>
          <Field label="Origen (cómo llegó)">
            <TextInput
              value={form.origen ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))}
              placeholder="Portal, cartel, referido…"
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
        message={`¿Eliminar a "${delTarget?.nombre}" del pipeline?`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
