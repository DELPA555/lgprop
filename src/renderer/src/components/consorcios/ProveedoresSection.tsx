import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { ProveedorEdificio } from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

const FRECUENCIAS = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Por evento']

type Form = Partial<ProveedorEdificio>

export default function ProveedoresSection({ consorcioId }: { consorcioId: string }): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<ProveedorEdificio[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProveedorEdificio | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<ProveedorEdificio | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async (): Promise<void> => {
    const { data } = await supabase
      .from('proveedores_edificio')
      .select('*')
      .eq('consorcio_id', consorcioId)
      .order('nombre')
    setRows(data ?? [])
  }
  useEffect(() => {
    void load()
  }, [consorcioId])

  const openCreate = (): void => {
    setEditing(null)
    setForm({ frecuencia_pago: 'Mensual' })
    setModalOpen(true)
  }
  const openEdit = (p: ProveedorEdificio): void => {
    setEditing(p)
    setForm({ ...p })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.nombre?.trim()) return toast.error('El nombre del proveedor es obligatorio')
    setSaving(true)
    const payload = {
      consorcio_id: consorcioId,
      nombre: form.nombre.trim(),
      servicio: form.servicio || null,
      telefono: form.telefono || null,
      email: form.email || null,
      frecuencia_pago: form.frecuencia_pago || null,
      condiciones: form.condiciones || null,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('proveedores_edificio').update(payload).eq('id', editing.id)
      : await supabase.from('proveedores_edificio').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Proveedor actualizado' : 'Proveedor agregado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('proveedores_edificio').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Proveedor eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Truck size={16} className="text-ink-3" /> Proveedores del edificio
        </h2>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Servicio</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Frecuencia</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                  Sin proveedores cargados para este edificio.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{p.nombre}</td>
                  <td className="px-4 py-3 text-ink-2">{p.servicio || '—'}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {p.telefono ? (
                      <TelefonoWhatsApp numero={p.telefono} size={14} />
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                    {p.email && <div className="text-[11px] text-ink-3">{p.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{p.frecuencia_pago || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(p)}
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
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
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
            <Field label="Servicio que presta">
              <TextInput
                value={form.servicio ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, servicio: e.target.value }))}
                placeholder="Ascensor, limpieza, seguridad…"
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
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Frecuencia de pago">
            <Select
              value={form.frecuencia_pago ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, frecuencia_pago: e.target.value || null }))}
            >
              <option value="">— Sin definir —</option>
              {FRECUENCIAS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contrato / condiciones">
            <TextArea
              value={form.condiciones ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, condiciones: e.target.value }))}
              placeholder="Ej: contrato anual, aumenta por índice; abono fijo mensual; etc."
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el proveedor "${delTarget?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </>
  )
}
