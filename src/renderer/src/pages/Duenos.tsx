import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Dueno } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'

type Form = Partial<Dueno>
const EMPTY: Form = {
  nombre: '',
  telefono: '',
  email: '',
  cbu: '',
  alias_cbu: '',
  porcentaje_comision: 0,
  notas: ''
}

export default function Duenos(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Dueno[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Dueno | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Dueno | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [propCounts, setPropCounts] = useState<Record<string, number>>({})

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.from('duenos').select('*').order('nombre')
    if (error) toast.error(error.message)
    setRows(data ?? [])
    // Conteo de propiedades por dueño (para la columna)
    const { data: props } = await supabase.from('propiedades').select('dueno_id')
    const counts: Record<string, number> = {}
    for (const p of props ?? []) if (p.dueno_id) counts[p.dueno_id] = (counts[p.dueno_id] ?? 0) + 1
    setPropCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      [r.nombre, r.telefono, r.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    )
  }, [rows, q])

  const openCreate = (): void => {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }
  const openEdit = (d: Dueno): void => {
    setEditing(d)
    setForm({ ...d })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.nombre?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    const payload = {
      nombre: form.nombre.trim(),
      telefono: form.telefono || null,
      email: form.email || null,
      cbu: form.cbu || null,
      alias_cbu: form.alias_cbu || null,
      porcentaje_comision: Number(form.porcentaje_comision) || 0,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('duenos').update(payload).eq('id', editing.id)
      : await supabase.from('duenos').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editing ? 'Dueño actualizado' : 'Dueño creado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('duenos').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) {
      toast.error(
        error.message.includes('foreign key')
          ? 'No se puede eliminar: el dueño tiene propiedades asociadas.'
          : error.message
      )
      return
    }
    toast.success('Dueño eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Dueños"
        subtitle={`${rows.length} registrado${rows.length !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo dueño
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input w-full pl-9"
          placeholder="Buscar por nombre, teléfono o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Datos de cobro</th>
              <th className="px-4 py-3 font-medium text-center">Comisión</th>
              <th className="px-4 py-3 font-medium text-center">Propiedades</th>
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
                  {rows.length === 0 ? 'Todavía no hay dueños cargados.' : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{d.nombre}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    <TelefonoWhatsApp numero={d.telefono} />
                    <div className="text-xs text-zinc-600">{d.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {d.alias_cbu || d.cbu ? (
                      <div className="text-xs">
                        {d.alias_cbu && <div>Alias: {d.alias_cbu}</div>}
                        {d.cbu && <div className="text-zinc-600">CBU: {d.cbu}</div>}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-300 tabular-nums">
                    {d.porcentaje_comision ? `${d.porcentaje_comision}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Building2 size={13} className="text-zinc-500" />
                      {propCounts[d.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(d)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(d)}
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

      <Modal
        open={modalOpen}
        title={editing ? 'Editar dueño' : 'Nuevo dueño'}
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
          <Field label="Nombre" required>
            <TextInput
              value={form.nombre ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <TextInput
                value={form.telefono ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alias CBU">
              <TextInput
                value={form.alias_cbu ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, alias_cbu: e.target.value }))}
              />
            </Field>
            <Field label="CBU">
              <TextInput
                value={form.cbu ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cbu: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Comisión por administración (%)">
            <TextInput
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.porcentaje_comision ?? 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, porcentaje_comision: Number(e.target.value) }))
              }
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
        message={`¿Eliminar al dueño "${delTarget?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
