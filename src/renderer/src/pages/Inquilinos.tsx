import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Inquilino } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

type Form = Partial<Inquilino>
const EMPTY: Form = {
  nombre: '',
  telefono: '',
  email: '',
  dni: '',
  garante_nombre: '',
  garante_telefono: '',
  garante_dni: '',
  notas: ''
}

export default function Inquilinos(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Inquilino[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Inquilino | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Inquilino | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.from('inquilinos').select('*').order('nombre')
    if (error) toast.error(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      [r.nombre, r.telefono, r.email, r.dni, r.garante_nombre]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    )
  }, [rows, q])

  const openCreate = (): void => {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }
  const openEdit = (d: Inquilino): void => {
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
      dni: form.dni || null,
      garante_nombre: form.garante_nombre || null,
      garante_telefono: form.garante_telefono || null,
      garante_dni: form.garante_dni || null,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('inquilinos').update(payload).eq('id', editing.id)
      : await supabase.from('inquilinos').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editing ? 'Inquilino actualizado' : 'Inquilino creado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('inquilinos').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) {
      toast.error(
        error.message.includes('foreign key')
          ? 'No se puede eliminar: el inquilino tiene contratos asociados.'
          : error.message
      )
      return
    }
    toast.success('Inquilino eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Inquilinos"
        subtitle={`${rows.length} registrado${rows.length !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo inquilino
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input w-full pl-9"
          placeholder="Buscar por nombre, DNI, teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">DNI</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Garante</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  {rows.length === 0 ? 'Todavía no hay inquilinos cargados.' : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{d.nombre}</td>
                  <td className="px-4 py-3 text-zinc-400">{d.dni || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    <div>{d.telefono || '—'}</div>
                    <div className="text-xs text-zinc-600">{d.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {d.garante_nombre ? (
                      <div className="text-xs">
                        <div>{d.garante_nombre}</div>
                        <div className="text-zinc-600">
                          {[d.garante_dni, d.garante_telefono].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
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
        title={editing ? 'Editar inquilino' : 'Nuevo inquilino'}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required>
              <TextInput
                value={form.nombre ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                autoFocus
              />
            </Field>
            <Field label="DNI">
              <TextInput
                value={form.dni ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
              />
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
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Garante</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Nombre">
                <TextInput
                  value={form.garante_nombre ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, garante_nombre: e.target.value }))}
                />
              </Field>
              <Field label="DNI">
                <TextInput
                  value={form.garante_dni ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, garante_dni: e.target.value }))}
                />
              </Field>
              <Field label="Teléfono">
                <TextInput
                  value={form.garante_telefono ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, garante_telefono: e.target.value }))}
                />
              </Field>
            </div>
          </div>

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
        message={`¿Eliminar al inquilino "${delTarget?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
