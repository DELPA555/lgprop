// Modal para marcar manualmente que un contrato ya se actualizó.
// Autocontenido: al abrir trae los índices y la última actualización para
// sugerir el nuevo monto (editable). Al confirmar aplica el cambio.
import { useEffect, useState } from 'react'
import { Loader2, ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Contrato, IndiceValor, ActualizacionContrato } from '@/types/database'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatMoneda, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { calcularActualizacion } from '@/lib/actualizaciones'
import { aplicarActualizacionManual, proximaTrasActualizar } from '@/lib/confirmarActualizacion'

export default function MarcarActualizadoModal({
  contrato,
  etiqueta,
  onClose,
  onDone
}: {
  contrato: Contrato | null
  etiqueta?: string
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [monto, setMonto] = useState('')
  const [detalle, setDetalle] = useState<string>('')

  useEffect(() => {
    if (!contrato) return
    setMonto(String(contrato.monto_actual))
    setDetalle('')
    // Sugerir el monto según el índice del contrato (si hay datos).
    void (async () => {
      setLoading(true)
      try {
        const [v, ult] = await Promise.all([
          supabase.from('indices_valores').select('*'),
          supabase
            .from('actualizaciones_contrato')
            .select('*')
            .eq('contrato_id', contrato.id)
            .eq('confirmado_por_usuario', true)
            .order('fecha_calculo', { ascending: false })
            .limit(1)
            .maybeSingle()
        ])
        const valores = (v.data ?? []) as IndiceValor[]
        const ultima = ult.data as ActualizacionContrato | null
        const fechaAnterior = ultima?.fecha_calculo ?? contrato.fecha_inicio
        const fechaNueva = contrato.proxima_actualizacion ?? todayISO()
        const calc = calcularActualizacion(contrato, fechaAnterior, fechaNueva, valores)
        if (calc.ok && !calc.manual && calc.montoNuevo > 0) {
          setMonto(String(calc.montoNuevo))
          setDetalle(calc.detalle)
        } else if (calc.manual) {
          setDetalle('Índice manual: ingresá el nuevo monto.')
        } else if (!calc.ok) {
          setDetalle(`Sin datos para sugerir (${calc.motivo}). Ingresá el monto a mano.`)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [contrato])

  if (!contrato) return <></>

  const nuevo = parseFloat(monto) || 0
  const pct =
    contrato.monto_actual > 0 ? ((nuevo - contrato.monto_actual) / contrato.monto_actual) * 100 : 0
  const nextProx = proximaTrasActualizar(contrato)

  const confirmar = async (): Promise<void> => {
    if (!nuevo || nuevo <= 0) return void toast.error('Ingresá un nuevo monto válido')
    setSaving(true)
    try {
      const { error } = await aplicarActualizacionManual(contrato, nuevo)
      if (error) return void toast.error(error)
      toast.success('Contrato actualizado')
      onDone()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!contrato}
      onClose={onClose}
      title="Marcar como actualizado"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={saving || loading}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Confirmar actualización
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {etiqueta && <p className="text-sm text-ink-2">{etiqueta}</p>}

        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] text-ink-3 uppercase tracking-wider">Monto actual</p>
            <p className="text-sm text-ink-2 num">
              {formatMoneda(contrato.monto_actual, contrato.moneda)}
            </p>
          </div>
          <ArrowRight size={16} className="text-ink-3" />
          <div>
            <p className="text-[10px] text-ink-3 uppercase tracking-wider">Nuevo monto</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                autoFocus
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="input w-40 py-1"
              />
              <span className={`text-xs font-semibold ${pct >= 0 ? 'text-ok' : 'text-bad'}`}>
                {pct >= 0 ? '+' : ''}
                {pct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-ink-3 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Calculando sugerencia…
          </p>
        ) : (
          detalle && <p className="text-xs text-ink-3">{detalle}</p>
        )}

        <div className="text-xs text-ink-3 border-t border-border/60 pt-3">
          Índice: <span className="text-ink-2">{contrato.indice_actualizacion}</span> · cada{' '}
          {contrato.frecuencia_actualizacion_meses} m · próximo ajuste:{' '}
          <span className="text-ink-2">
            {nextProx ? formatDate(nextProx) : 'fin del contrato'}
          </span>
        </div>
      </div>
    </Modal>
  )
}
