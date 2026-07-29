import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { SeguroPropiedad, TipoSeguro } from '@/types/database'
import Modal from '@/components/ui/Modal'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

export const SEGURO_TIPOS: { id: TipoSeguro; label: string }[] = [
  { id: 'seguro', label: 'Seguro del inmueble' },
  { id: 'art', label: 'ART' },
  { id: 'otro', label: 'Otro' }
]
export const seguroTipoLabel = (t: TipoSeguro): string =>
  SEGURO_TIPOS.find((x) => x.id === t)?.label ?? t

type Form = Partial<SeguroPropiedad>

export default function SeguroModal({
  open,
  onClose,
  editing,
  propiedadId,
  onSaved
}: {
  open: boolean
  onClose: () => void
  editing: SeguroPropiedad | null
  propiedadId: string
  onSaved: () => void
}): JSX.Element {
  const toast = useToast()
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(editing ? { ...editing } : { tipo: 'seguro', fecha_vencimiento: '' })
  }, [open, editing])

  const save = async (): Promise<void> => {
    if (!form.fecha_vencimiento) return toast.error('Cargá la fecha de vencimiento')
    setSaving(true)
    const payload = {
      propiedad_id: propiedadId,
      tipo: (form.tipo ?? 'seguro') as TipoSeguro,
      aseguradora: form.aseguradora || null,
      numero_poliza: form.numero_poliza || null,
      fecha_vencimiento: form.fecha_vencimiento,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('seguros_propiedad').update(payload).eq('id', editing.id)
      : await supabase.from('seguros_propiedad').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Seguro actualizado' : 'Seguro cargado')
    onClose()
    onSaved()
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Editar seguro' : 'Nuevo seguro / ART'}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" required>
            <Select
              value={form.tipo ?? 'seguro'}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoSeguro }))}
            >
              {SEGURO_TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vencimiento" required>
            <TextInput
              type="date"
              value={form.fecha_vencimiento ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aseguradora">
            <TextInput
              value={form.aseguradora ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, aseguradora: e.target.value }))}
            />
          </Field>
          <Field label="N° de póliza">
            <TextInput
              value={form.numero_poliza ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, numero_poliza: e.target.value }))}
            />
          </Field>
        </div>
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
