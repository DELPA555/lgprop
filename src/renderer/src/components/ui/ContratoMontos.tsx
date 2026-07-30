// Muestra el valor "actual" (último monto confirmado) y el "inicial" de un
// contrato, en la moneda correspondiente. Si hay una actualización calculada
// pero no confirmada, muestra un chip "actualización pendiente".
import { formatMoneda } from '@/lib/format'
import type { Moneda } from '@/types/database'
import EstadoChip from './EstadoChip'

interface Props {
  inicial: number
  actual: number
  moneda: Moneda
  /** Hay una actualización calculada sin confirmar para este contrato. */
  pendiente?: boolean
  /** Alinea el bloque (en tablas suele ir a la derecha). */
  align?: 'left' | 'right'
  className?: string
}

export default function ContratoMontos({
  inicial,
  actual,
  moneda,
  pendiente = false,
  align = 'right',
  className = ''
}: Props): JSX.Element {
  const cambio = actual !== inicial
  const alineado = align === 'right' ? 'items-end text-right' : 'items-start text-left'
  return (
    <div className={`flex flex-col ${alineado} ${className}`}>
      <div className="num text-ink">
        <span className="text-[10px] text-ink-3 mr-1">Actual</span>
        {formatMoneda(actual, moneda)}
        {moneda === 'USD' && (
          <span className="ml-1 text-[9px] font-semibold text-info align-top">USD</span>
        )}
      </div>
      <div className="num text-[11px] text-ink-3">
        <span className="mr-1">Inicial</span>
        {cambio ? formatMoneda(inicial, moneda) : '= actual'}
      </div>
      {pendiente && (
        <div className="mt-1">
          <EstadoChip tone="warn">actualización pendiente</EstadoChip>
        </div>
      )}
    </div>
  )
}
