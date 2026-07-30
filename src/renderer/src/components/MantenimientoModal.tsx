import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Mantenimiento, Propiedad, EstadoMantenimiento } from '@/types/database'
import Modal from '@/components/ui/Modal'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { todayISO } from '@/lib/dates'

export const MANT_ESTADOS: { id: EstadoMantenimiento; label: string; badge: string }[] = [
  { id: 'pendiente', label: 'Pendiente', badge: 'bg-warn/10 text-warn border-warn/25' },
  { id: 'en_proceso', label: 'En proceso', badge: 'bg-info/10 text-info border-info/25' },
  {
    id: 'resuelto',
    label: 'Resuelto',
    badge: 'bg-ok/10 text-ok border-ok/25'
  }
]
export const mantEstadoLabel = (e: EstadoMantenimiento): string =>
  MANT_ESTADOS.find((x) => x.id === e)?.label ?? e
export const mantEstadoBadge = (e: EstadoMantenimiento): string =>
  MANT_ESTADOS.find((x) => x.id === e)?.badge ?? ''

type Form = Partial<Mantenimiento>

export default function MantenimientoModal({
  open,
  onClose,
  editing,
  propiedades,
  fixedPropiedadId,
  onSaved
}: {
  open: boolean
  onClose: () => void
  editing: Mantenimiento | null
  propiedades: Propiedad[]
  fixedPropiedadId?: string
  onSaved: () => void
}): JSX.Element {
  const toast = useToast()
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? { ...editing }
        : {
            propiedad_id: fixedPropiedadId ?? '',
            fecha_reporte: todayISO(),
            estado: 'pendiente',
            descripcion: ''
          }
    )
  }, [open, editing, fixedPropiedadId])

  const save = async (): Promise<void> => {
    if (!form.propiedad_id) return toast.error('Elegí una propiedad')
    if (!form.descripcion?.trim()) return toast.error('Describí el reclamo')
    setSaving(true)
    const payload = {
      propiedad_id: form.propiedad_id,
      fecha_reporte: form.fecha_reporte || todayISO(),
      descripcion: form.descripcion.trim(),
      estado: (form.estado ?? 'pendiente') as EstadoMantenimiento,
      fecha_resolucion: form.estado === 'resuelto' ? form.fecha_resolucion || todayISO() : null,
      costo: form.costo === null || form.costo === undefined ? null : Number(form.costo),
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('mantenimiento').update(payload).eq('id', editing.id)
      : await supabase.from('mantenimiento').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Reclamo actualizado' : 'Reclamo cargado')
    onClose()
    onSaved()
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Editar reclamo' : 'Nuevo reclamo'}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
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
        {!fixedPropiedadId && (
          <Field label="Propiedad" required>
            <Select
              value={form.propiedad_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, propiedad_id: e.target.value }))}
            >
              <option value="">— Elegir —</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.direccion}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Descripción del reclamo" required>
          <TextArea
            value={form.descripcion ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            placeholder="Ej: pérdida de agua en el baño; se rompió el termotanque…"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Fecha de reporte">
            <TextInput
              type="date"
              value={form.fecha_reporte ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, fecha_reporte: e.target.value }))}
            />
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
          <Field label="Costo (opcional)">
            <TextInput
              type="number"
              min={0}
              placeholder="—"
              value={form.costo ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  costo: e.target.value === '' ? null : Number(e.target.value)
                }))
              }
            />
          </Field>
        </div>
        {form.estado === 'resuelto' && (
          <Field label="Fecha de resolución">
            <TextInput
              type="date"
              value={form.fecha_resolucion ?? todayISO()}
              onChange={(e) => setForm((f) => ({ ...f, fecha_resolucion: e.target.value }))}
            />
          </Field>
        )}
        <Field label="Notas">
          <TextArea
            value={form.notas ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  )
}
