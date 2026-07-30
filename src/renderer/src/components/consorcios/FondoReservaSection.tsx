import { useEffect, useMemo, useState } from 'react'
import { PiggyBank, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { MovimientoFondoReserva } from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

export default function FondoReservaSection({ consorcioId }: { consorcioId: string }): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<MovimientoFondoReserva[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [fecha, setFecha] = useState(todayISO())
  const [concepto, setConcepto] = useState('')
  const [tipo, setTipo] = useState<'aporte' | 'egreso'>('aporte')
  const [monto, setMonto] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<MovimientoFondoReserva | null>(null)
  const [deleting, setDeleting] = useState(false)

  const saldo = useMemo(() => rows.reduce((t, m) => t + (Number(m.monto) || 0), 0), [rows])

  const load = async (): Promise<void> => {
    setLoading(true)
    const { data } = await supabase
      .from('fondo_reserva')
      .select('*')
      .eq('consorcio_id', consorcioId)
      .order('fecha', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [consorcioId])

  const openCreate = (): void => {
    setFecha(todayISO())
    setConcepto('')
    setTipo('aporte')
    setMonto(0)
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!concepto.trim()) return toast.error('Poné un concepto')
    if (!monto || monto <= 0) return toast.error('El monto debe ser mayor a 0')
    setSaving(true)
    const signed = tipo === 'egreso' ? -Math.abs(Number(monto)) : Math.abs(Number(monto))
    const { error } = await supabase.from('fondo_reserva').insert({
      consorcio_id: consorcioId,
      fecha,
      concepto: concepto.trim(),
      monto: signed
    })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success('Movimiento registrado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('fondo_reserva').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Movimiento eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <PiggyBank size={16} className="text-ink-3" /> Fondo de reserva
        </h2>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Nuevo movimiento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-1">
          <p className="text-xs text-ink-3 uppercase tracking-wider">Saldo acumulado</p>
          <p className={`num text-3xl font-bold mt-1 ${saldo >= 0 ? 'text-ok' : 'text-bad'}`}>
            {formatARS(saldo)}
          </p>
          <p className="text-[11px] text-ink-3 mt-1">{rows.length} movimiento(s)</p>
        </div>

        <div className="card overflow-hidden md:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
                <th className="px-4 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                    Sin movimientos. Los aportes se suman automáticamente al generar cada
                    liquidación.
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-ink-3 text-xs whitespace-nowrap">
                      {formatDate(m.fecha)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{m.concepto}</td>
                    <td
                      className={`px-4 py-2.5 text-right num ${
                        Number(m.monto) >= 0 ? 'text-ok' : 'text-bad'
                      }`}
                    >
                      {Number(m.monto) >= 0 ? '+' : '−'}
                      {formatARS(Math.abs(Number(m.monto)))}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {/* Los aportes de liquidación se borran al eliminar la liquidación */}
                      {!m.liquidacion_id && (
                        <button
                          onClick={() => setDelTarget(m)}
                          className="p-1 rounded-md text-ink-3 hover:text-bad hover:bg-white/5"
                          title="Eliminar movimiento"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="Nuevo movimiento de fondo"
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
            <Field label="Fecha">
              <TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Tipo">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as 'aporte' | 'egreso')}>
                <option value="aporte">Aporte (+)</option>
                <option value="egreso">Egreso / uso (−)</option>
              </Select>
            </Field>
          </div>
          <Field label="Concepto" required>
            <TextInput
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Aporte extraordinario / Reparación bomba de agua"
            />
          </Field>
          <Field label="Monto" required>
            <TextInput
              type="number"
              min={0}
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el movimiento "${delTarget?.concepto}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </>
  )
}
