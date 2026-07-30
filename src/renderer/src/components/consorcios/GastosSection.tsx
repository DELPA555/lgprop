import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { GastoEdificio, ProveedorEdificio } from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

export const CATEGORIAS_GASTO = [
  'Limpieza',
  'Seguridad',
  'Ascensor',
  'Luz',
  'Gas',
  'Agua',
  'Sueldos',
  'Mantenimiento',
  'Seguro',
  'Honorarios',
  'Otros'
]

const currentYM = (): string => todayISO().slice(0, 7)
type Form = Partial<GastoEdificio>

export default function GastosSection({ consorcioId }: { consorcioId: string }): JSX.Element {
  const toast = useToast()
  const [ym, setYm] = useState(currentYM())
  const [rows, setRows] = useState<GastoEdificio[]>([])
  const [proveedores, setProveedores] = useState<ProveedorEdificio[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GastoEdificio | null>(null)
  const [form, setForm] = useState<Form>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<GastoEdificio | null>(null)
  const [deleting, setDeleting] = useState(false)

  const mesISO = `${ym}-01`

  const provMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of proveedores) m[p.id] = p.nombre
    return m
  }, [proveedores])

  const total = useMemo(() => rows.reduce((t, g) => t + (Number(g.monto) || 0), 0), [rows])

  const loadProveedores = async (): Promise<void> => {
    const { data } = await supabase
      .from('proveedores_edificio')
      .select('*')
      .eq('consorcio_id', consorcioId)
      .order('nombre')
    setProveedores(data ?? [])
  }
  const loadGastos = async (): Promise<void> => {
    setLoading(true)
    const { data } = await supabase
      .from('gastos_edificio')
      .select('*')
      .eq('consorcio_id', consorcioId)
      .eq('mes_correspondiente', mesISO)
      .order('fecha', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadProveedores()
  }, [consorcioId])
  useEffect(() => {
    void loadGastos()
  }, [consorcioId, mesISO])

  const openCreate = (): void => {
    setEditing(null)
    setForm({ fecha: todayISO(), categoria: 'Otros', monto: 0 })
    setModalOpen(true)
  }
  const openEdit = (g: GastoEdificio): void => {
    setEditing(g)
    setForm({ ...g, mes_correspondiente: g.mes_correspondiente.slice(0, 7) })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.concepto?.trim()) return toast.error('Poné el concepto del gasto')
    if (!form.monto || Number(form.monto) <= 0) return toast.error('El monto debe ser mayor a 0')
    setSaving(true)
    const mesForm = form.mes_correspondiente ? `${String(form.mes_correspondiente).slice(0, 7)}-01` : mesISO
    const payload = {
      consorcio_id: consorcioId,
      proveedor_id: form.proveedor_id || null,
      concepto: form.concepto.trim(),
      categoria: form.categoria || null,
      monto: Number(form.monto),
      fecha: form.fecha || todayISO(),
      mes_correspondiente: mesForm,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('gastos_edificio').update(payload).eq('id', editing.id)
      : await supabase.from('gastos_edificio').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Gasto actualizado' : 'Gasto agregado')
    setModalOpen(false)
    // Si se cargó en otro mes, saltar a ese mes para verlo
    if (mesForm.slice(0, 7) !== ym) setYm(mesForm.slice(0, 7))
    else void loadGastos()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('gastos_edificio').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Gasto eliminado')
    setDelTarget(null)
    void loadGastos()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Receipt size={16} className="text-ink-3" /> Gastos del edificio
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value || currentYM())}
            className="input"
          />
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Nuevo gasto
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium text-right">Monto</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-3">
                  Sin gastos cargados para este mes.
                </td>
              </tr>
            ) : (
              rows.map((g) => (
                <tr key={g.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-3 text-xs whitespace-nowrap">
                    {formatDate(g.fecha)}
                  </td>
                  <td className="px-4 py-3 text-white">{g.concepto}</td>
                  <td className="px-4 py-3">
                    {g.categoria ? (
                      <span className="chip chip-muted">{g.categoria}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {g.proveedor_id ? provMap[g.proveedor_id] ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-right num text-ink">{formatARS(g.monto)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(g)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(g)}
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
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={4} className="px-4 py-3 text-right text-xs text-ink-3 uppercase tracking-wider">
                  Total del mes
                </td>
                <td className="px-4 py-3 text-right num font-semibold text-ink">{formatARS(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar gasto' : 'Nuevo gasto'}
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
          <Field label="Concepto" required>
            <TextInput
              value={form.concepto ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Ej: Abono mantenimiento ascensor"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select
                value={form.categoria ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value || null }))}
              >
                <option value="">— Sin categoría —</option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto" required>
              <TextInput
                type="number"
                min={0}
                value={form.monto ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <Field label="Proveedor">
            <Select
              value={form.proveedor_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value || null }))}
            >
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha del gasto">
              <TextInput
                type="date"
                value={form.fecha ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </Field>
            <Field label="Mes que imputa (liquidación)">
              <TextInput
                type="month"
                value={
                  form.mes_correspondiente
                    ? String(form.mes_correspondiente).slice(0, 7)
                    : ym
                }
                onChange={(e) => setForm((f) => ({ ...f, mes_correspondiente: e.target.value }))}
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

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el gasto "${delTarget?.concepto}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </>
  )
}
